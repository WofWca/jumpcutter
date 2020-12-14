'use strict';
import { audioContext, mediaElementSourcesMap } from './audioContext';
import {
  getRealtimeMargin,
  getNewLookaheadDelay,
  getTotalDelay,
  getStretcherDelayChange,
  getStretcherSoundedDelay,
  getMomentOutputTime,
  transformSpeed,
} from './helpers';
import type { Time, StretchInfo } from '@/helpers';
import type { Settings as ExtensionSettings } from '@/settings';
import { getAbsoluteSilenceSpeed } from '@/settings';
import type PitchPreservingStretcherNode from './PitchPreservingStretcherNode';
import { assert } from '@/helpers';


// Assuming normal speech speed. Looked here https://en.wikipedia.org/wiki/Sampling_(signal_processing)#Sampling_rate
const MIN_HUMAN_SPEECH_ADEQUATE_SAMPLE_RATE = 8000;
const MAX_MARGIN_BEFORE_VIDEO_TIME = 0.5;
// Not just MIN_SOUNDED_SPEED, because in theory sounded speed could be greater than silence speed.
const MIN_SPEED = 0.25;
const MAX_MARGIN_BEFORE_REAL_TIME = MAX_MARGIN_BEFORE_VIDEO_TIME / MIN_SPEED;

const logging = process.env.NODE_ENV !== 'production';

type ControllerInitialized =
  Controller
  & { initialized: true }
  & Required<Pick<Controller, 'initialized' | '_initPromise' | 'audioContext' | '_suspendAudioContext'
    | '_resumeAudioContext' | '_volumeFilter'
    | '_silenceDetectorNode' | '_analyzerIn' | '_volumeInfoBuffer' | '_mediaElementSource'
    | '_lastActualPlaybackRateChange'>>;
type ControllerWithStretcher = Controller & Required<Pick<Controller, '_lookahead' | '_stretcher'>>;
type ControllerLogging = Controller & Required<Pick<Controller, '_log' | '_logIntervalId' | '_outVolumeFilter'
  | '_analyzerOut'>>;

// Not a method so it gets eliminated at optimization.
const isLogging = (controller: Controller): controller is ControllerLogging => logging;

type ControllerSettings =
  Pick<
    ExtensionSettings,
    'volumeThreshold'
    | 'soundedSpeed'
    | 'marginBefore'
    | 'marginAfter'
    | 'enableDesyncCorrection'
  > & {
    silenceSpeed: number,
  };

function isStretcherEnabled(settings: ControllerSettings) {
  return settings.marginBefore > 0;
}

export function extensionSettings2ControllerSettings(extensionSettings: ExtensionSettings): ControllerSettings {
  return {
    ...extensionSettings,
    silenceSpeed: getAbsoluteSilenceSpeed(extensionSettings),
  };
}

export default class Controller {
  // I'd be glad to make most of these `private` but this makes it harder to specify types in this file. TODO maybe I'm
  // just too bad at TypeScript.
  readonly element: HTMLMediaElement;
  settings: ControllerSettings;
  initialized = false;
  _initPromise?: Promise<this>;
  audioContext?: AudioContext;
  _suspendAudioContext?: () => void;
  _resumeAudioContext?: () => void;
  _volumeFilter?: AudioWorkletNode;
  _silenceDetectorNode?: AudioWorkletNode;
  _analyzerIn?: AnalyserNode;
  _volumeInfoBuffer?: Float32Array;
  _lookahead?: DelayNode;
  _stretcher?: PitchPreservingStretcherNode;
  _mediaElementSource?: MediaElementAudioSourceNode;
  _lastScheduledStretch: null | StretchInfo = null;
  _lastActualPlaybackRateChange?: {
    time: Time,
    value: number,
    name: 'sounded' | 'silence',
  };
  _didNotDoDesyncCorrectionForNSpeedSwitches = 0;
  _outVolumeFilter?: AudioWorkletNode;
  _analyzerOut?: AnalyserNode;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  _log?: (msg?: any) => void;
  _logIntervalId?: number;

  constructor(videoElement: HTMLMediaElement, controllerSettings: ControllerSettings) {
    this.element = videoElement;
    this.settings = controllerSettings;
  }

  isInitialized(): this is ControllerInitialized {
    return this.initialized;
  }
  isStretcherEnabled(): this is ControllerWithStretcher {
    return isStretcherEnabled(this.settings);
  }

  async init(): Promise<this> {
    let resolveInitPromise: (result: this) => void;
    // TODO how about also rejecting it when `init()` throws? Would need to put the whole initialization in the promise
    // executor?
    this._initPromise = new Promise(resolve => resolveInitPromise = resolve);

    const ctx = audioContext;
    this.audioContext = ctx;

    // This is mainly to reduce CPU consumption while the video is paused. Also gets rid of slight misbehaviors like
    // speed always becoming silenceSpeed when media element gets paused, which causes a guaranteed audio stretch on
    // resume.
    // TODO I don't have much of idea if this can cause issues. Something along the lines of other audio sources
    // stopping working?
    this._suspendAudioContext = () => audioContext.suspend();
    this._resumeAudioContext = () => audioContext.resume();
    if (this.element.paused) {
      audioContext.suspend();
    }
    // TODO would be cool if we could just `addEventListener('pause', audioContext.suspend)`, but it says
    // "illegal invocation".
    this.element.addEventListener('pause', this._suspendAudioContext);
    this.element.addEventListener('play', this._resumeAudioContext);

    await ctx.audioWorklet.addModule(chrome.runtime.getURL('content/SilenceDetectorProcessor.js'));
    await ctx.audioWorklet.addModule(chrome.runtime.getURL('content/VolumeFilter.js'));

    const maxSpeedToPreserveSpeech = ctx.sampleRate / MIN_HUMAN_SPEECH_ADEQUATE_SAMPLE_RATE;
    const maxMaginStretcherDelay = MAX_MARGIN_BEFORE_REAL_TIME * (maxSpeedToPreserveSpeech / MIN_SPEED);

    this._volumeFilter = new AudioWorkletNode(ctx, 'VolumeFilter', {
      outputChannelCount: [1],
      processorOptions: {
        maxSmoothingWindowLength: 0.03,
      },
      parameterData: {
        smoothingWindowLength: 0.03, // TODO make a setting out of it.
      },
    });
    this._silenceDetectorNode = new AudioWorkletNode(ctx, 'SilenceDetectorProcessor', {
      parameterData: {
        durationThreshold: this._getSilenceDetectorNodeDurationThreshold(),
      },
      processorOptions: { initialDuration: 0 },
      numberOfOutputs: 0,
    });
    this._analyzerIn = ctx.createAnalyser();
    // Using the minimum possible value for performance, as we're only using the node to get unchanged output values.
    this._analyzerIn.fftSize = 2 ** 5;
    this._volumeInfoBuffer = new Float32Array(this._analyzerIn.fftSize);
    if (isLogging(this)) {
      this._outVolumeFilter = new AudioWorkletNode(ctx, 'VolumeFilter', {
        outputChannelCount: [1],
      });
      this._analyzerOut = ctx.createAnalyser();
    }
    // Actually this check is not required as the extension handles marginBefore being 0 and stretcher being enabled
    // well. This is purely for performance. TODO?
    if (this.isStretcherEnabled()) {
      this._lookahead = ctx.createDelay(MAX_MARGIN_BEFORE_REAL_TIME);
      const { default: PitchPreservingStretcherNode } = await import(
        /* webpackMode: 'eager' */
        './PitchPreservingStretcherNode'
      );
      this._stretcher = new PitchPreservingStretcherNode(ctx, maxMaginStretcherDelay);
    }
    const srcFromMap = mediaElementSourcesMap.get(this.element);
    if (srcFromMap) {
      this._mediaElementSource = srcFromMap;
      this._mediaElementSource.disconnect();
    } else {
      this._mediaElementSource = ctx.createMediaElementSource(this.element);
      mediaElementSourcesMap.set(this.element, this._mediaElementSource)
    }
    if (this.isStretcherEnabled()) {
      this._mediaElementSource.connect(this._lookahead);
    } else {
      this._mediaElementSource.connect(audioContext.destination);
    }
    this._mediaElementSource.connect(this._volumeFilter);
    this._volumeFilter.connect(this._silenceDetectorNode);
    if (this.isStretcherEnabled()) {
      this._stretcher.connectInputFrom(this._lookahead);
      this._stretcher.connectOutputTo(ctx.destination);
    }
    this._volumeFilter.connect(this._analyzerIn);
    if (isLogging(this)) {
      if (this.isStretcherEnabled()) {
        this._stretcher.connectOutputTo(this._outVolumeFilter);
      } else {
        this._mediaElementSource.connect(this._outVolumeFilter);
      }
      this._outVolumeFilter.connect(this._analyzerOut);
    }
    this._setStateAccordingToNewSettings();

    if (isLogging(this)) {
      const logArr = [];
      const logBuffer = new Float32Array(this._analyzerOut.fftSize);
      this._log = (msg = null) => {

        this._analyzerOut!.getFloatTimeDomainData(logBuffer);
        const outVol = logBuffer[logBuffer.length - 1];
        this._analyzerIn!.getFloatTimeDomainData(logBuffer);
        const inVol = logBuffer[logBuffer.length - 1];
        logArr.push({
          msg,
          t: ctx.currentTime,
          // delay: stretcherInitialDelay, // TODO fix this. It's not `initialDelay` it should be `stretcher.delay`
          speed: this.element.playbackRate,
          inVol,
          outVol,
        });
      }
    }

    this._silenceDetectorNode.port.onmessage = (msg) => {
      const { time: eventTime, type: silenceStartOrEnd } = msg.data;
      if (silenceStartOrEnd === 'silenceEnd') {
        this._setSpeedAndLog('sounded');

        if (this.isStretcherEnabled()) {
          this._doOnSilenceEndStretcherStuff(eventTime);
        }
      } else {
        this._setSpeedAndLog('silence');

        if (this.isStretcherEnabled()) {
          this._doOnSilenceStartStretcherStuff(eventTime);
        }

        if (this.settings.enableDesyncCorrection) {
          // A workaround for https://github.com/vantezzen/skip-silence/issues/28.
          // Idea: https://github.com/vantezzen/skip-silence/issues/28#issuecomment-714317921
          // TODO remove it when/if it's fixed in Chromium. Or make the period adjustable.
          // It actually doesn't get noticeably out of sync for about 50 switches, but upon correction there is a
          // noticeable rewind in sound, so we use a smaller value.
          // Why on silenceStart, not on silenceEnd? Becasue when it's harder to notice a rewind when it's silent.
          // `marginAfter` ensures there's plenty of it.
          // Actually, I don't experience any inconveniences even when it's set to 1. But rewinds actually create short
          // pauses, so let's give it some bigger value.
          const DO_DESYNC_CORRECTION_EVERY_N_SEPEED_SWITCHES = 10;
          this._didNotDoDesyncCorrectionForNSpeedSwitches++;
          if (this._didNotDoDesyncCorrectionForNSpeedSwitches >= DO_DESYNC_CORRECTION_EVERY_N_SEPEED_SWITCHES) {
            this.element.currentTime -= 1e-9;
            // TODO but it's also corrected when the user seeks the video manually.
            this._didNotDoDesyncCorrectionForNSpeedSwitches = 0;
          }
        }
      }
    }
    if (isLogging(this)) {
      this._logIntervalId = (setInterval as typeof window.setInterval)(() => {
        this._log!();
      }, 1);
    }

    this.initialized = true;
    resolveInitPromise!(this);
    return this;
  }

  /** This only changes the state of `this._stretcher` */
  private _doOnSilenceEndStretcherStuff(eventTime: Time) {
    // TODO all this does look like it may cause a snowballing floating point error. Mathematically simplify this?
    // Or just use if-else?
    assert(this.isStretcherEnabled(), 'Attempted to use stretcher while it is disabled');

    // It is guaranteed to be non-null, because `_doOnSilenceStartStretcherStuff` is always called before this function.
    const lastScheduledStretcherDelayReset = this._lastScheduledStretch!;

    const lastSilenceSpeedLastsForRealtime =
      eventTime - lastScheduledStretcherDelayReset.newSpeedStartInputTime;
    const lastSilenceSpeedLastsForVideoTime = lastSilenceSpeedLastsForRealtime * this.settings.silenceSpeed;

    const marginBeforePartAtSilenceSpeedVideoTimeDuration = Math.min(
      lastSilenceSpeedLastsForVideoTime,
      this.settings.marginBefore
    );
    const marginBeforePartAlreadyAtSoundedSpeedVideoTimeDuration =
      this.settings.marginBefore - marginBeforePartAtSilenceSpeedVideoTimeDuration;
    const marginBeforePartAtSilenceSpeedRealTimeDuration =
      marginBeforePartAtSilenceSpeedVideoTimeDuration / this.settings.silenceSpeed;
    const marginBeforePartAlreadyAtSoundedSpeedRealTimeDuration =
      marginBeforePartAlreadyAtSoundedSpeedVideoTimeDuration / this.settings.soundedSpeed;
    // The time at which the moment from which the speed of the video needs to be slow has been on the input.
    const marginBeforeStartInputTime =
      eventTime
      - marginBeforePartAtSilenceSpeedRealTimeDuration
      - marginBeforePartAlreadyAtSoundedSpeedRealTimeDuration;
    // Same, but when it's going to be on the output.
    const marginBeforeStartOutputTime = getMomentOutputTime(
      marginBeforeStartInputTime,
      this._lookahead.delayTime.value,
      lastScheduledStretcherDelayReset
    );
    const marginBeforeStartOutputTimeTotalDelay = marginBeforeStartOutputTime - marginBeforeStartInputTime;
    const marginBeforeStartOutputTimeStretcherDelay =
      marginBeforeStartOutputTimeTotalDelay - this._lookahead.delayTime.value;

    // As you remember, silence on the input must last for some time before we speed up the video.
    // We then speed up these sections by reducing the stretcher delay.
    // And sometimes we may stumble upon a silence period long enough to make us speed up the video, but short
    // enough for us to not be done with speeding up that last part, so the margin before and that last part
    // overlap, and we end up in a situation where we only need to stretch the last part of the margin before
    // snippet, because the first one is already at required (sounded) speed, due to that delay before we speed up
    // the video after some silence.
    // This is also the reason why `getMomentOutputTime` function is so long.
    // Let's find this breakpoint.

    if (marginBeforeStartOutputTime < lastScheduledStretcherDelayReset.endTime) {
      // Cancel the complete delay reset, and instead stop decreasing it at `marginBeforeStartOutputTime`.
      this._stretcher.interruptLastScheduledStretch(
        // A.k.a. `lastScheduledStretcherDelayReset.startTime`
        marginBeforeStartOutputTimeStretcherDelay,
        marginBeforeStartOutputTime
      );
      if (isLogging(this)) {
        this._log({
          type: 'pauseReset',
          value: marginBeforeStartOutputTimeStretcherDelay,
          time: marginBeforeStartOutputTime,
        });
      }
    }

    const marginBeforePartAtSilenceSpeedStartOutputTime =
      marginBeforeStartOutputTime + marginBeforePartAlreadyAtSoundedSpeedRealTimeDuration
    // const silenceSpeedPartStretchedDuration = getNewSnippetDuration(
    //   marginBeforePartAtSilenceSpeedRealTimeDuration,
    //   this.settings.silenceSpeed,
    //   this.settings.soundedSpeed
    // );
    const stretcherDelayIncrease = getStretcherDelayChange(
      marginBeforePartAtSilenceSpeedRealTimeDuration,
      this.settings.silenceSpeed,
      this.settings.soundedSpeed
    );
    // I think currently it should always be equal to the max delay.
    const finalStretcherDelay = marginBeforeStartOutputTimeStretcherDelay + stretcherDelayIncrease;

    const startValue = marginBeforeStartOutputTimeStretcherDelay;
    const endValue = finalStretcherDelay;
    const startTime = marginBeforePartAtSilenceSpeedStartOutputTime;
    // A.k.a. `marginBeforePartAtSilenceSpeedStartOutputTime + silenceSpeedPartStretchedDuration`
    const endTime = eventTime + getTotalDelay(this._lookahead.delayTime.value, finalStretcherDelay);
    this._stretcher.stretch(startValue, endValue, startTime, endTime);
    this._lastScheduledStretch = {
      newSpeedStartInputTime: eventTime,
      startValue,
      endValue,
      startTime,
      endTime,
    }
    if (isLogging(this)) {
      this._log({ type: 'stretch', lastScheduledStretch: this._lastScheduledStretch });
    }
  }
  /** @see this._doOnSilenceEndStretcherStuff */
  private _doOnSilenceStartStretcherStuff(eventTime: Time) {
    assert(this.isStretcherEnabled(), 'Attempted to use stretcher while it is disabled');

    const realtimeMarginBefore = getRealtimeMargin(this.settings.marginBefore, this.settings.soundedSpeed);
    // When the time comes to increase the video speed, the stretcher's delay is always at its max value.
    const stretcherDelayStartValue =
      getStretcherSoundedDelay(this.settings.marginBefore, this.settings.soundedSpeed, this.settings.silenceSpeed);
    const startIn = getTotalDelay(this._lookahead.delayTime.value, stretcherDelayStartValue) - realtimeMarginBefore;

    const speedUpBy = this.settings.silenceSpeed / this.settings.soundedSpeed;

    const originalRealtimeSpeed = 1;
    const delayDecreaseSpeed = speedUpBy - originalRealtimeSpeed;
    const snippetNewDuration = stretcherDelayStartValue / delayDecreaseSpeed;
    const startTime = eventTime + startIn;
    const endTime = startTime + snippetNewDuration;
    this._stretcher.stretch(
      stretcherDelayStartValue,
      0,
      startTime,
      endTime
    );
    this._lastScheduledStretch = {
      newSpeedStartInputTime: eventTime,
      startTime,
      startValue: stretcherDelayStartValue,
      endTime,
      endValue: 0,
    };

    if (isLogging(this)) {
      this._log({ type: 'reset', lastScheduledStretch: this._lastScheduledStretch });
    }
  }

  /**
   * Assumes `init()` has been called (but not necessarily that its return promise has been resolved).
   * TODO make it work when it's false?
   */
  async destroy(): Promise<void> {
    await this._initPromise; // TODO would actually be better to interrupt it if it's still going.
    assert(this.isInitialized());

    this._mediaElementSource.disconnect();
    this._mediaElementSource.connect(audioContext.destination);

    this.element.removeEventListener('pause', this._suspendAudioContext);
    this.element.removeEventListener('play', this._resumeAudioContext);
    this.audioContext.resume(); // In case the video is paused.

    if (isLogging(this)) {
      clearInterval(this._logIntervalId);
    } else {
      assert(!this._logIntervalId);
    }

    const audioWorklets = [this._volumeFilter, this._silenceDetectorNode];
    if (isLogging(this)) {
      audioWorklets.push(this._outVolumeFilter);
    } else {
      assert(!this._outVolumeFilter);
    }
    for (const w of audioWorklets) {
      w.port.postMessage('destroy');
      w.port.close();
    }
    if (process.env.NODE_ENV !== 'production') {
      for (const propertyVal of Object.values(this)) {
        if (propertyVal instanceof AudioWorkletNode && !(audioWorklets as AudioWorkletNode[]).includes(propertyVal)) {
          console.warn('Undisposed AudioWorkletNode found. Expected all to be disposed upon `destroy()` call');
        }
      }
    }

    this._silenceDetectorNode.port.close(); // So the message handler can no longer be triggered.

    this._stretcher?.destroy();
    // Otherwise the stretcher's `destroy` may be called twice. TODO looks odd. Shouldn't we delete the other properties
    // as well then?
    delete this._stretcher;
    // TODO make `AudioWorkletProcessor`'s get collected.
    // https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process#Return_value
    // Currently they always return `true`.

    // TODO close `AudioWorkletProcessor`'s message ports?

    // TODO make sure built-in nodes (like gain) are also garbage-collected (I think they should be).
    this.element.playbackRate = 1; // TODO how about store the initial speed
  }

  /**
   * Can be called either when initializing or when updating settings.
   * TODO It's more performant to only update the things that rely on settings that changed, in a reactive way, but for
   * now it's like this so its harder to forget to update something.
   * @param oldSettings - better to provide this so the current state can be reconstructed and
   * respected (e.g. if a silent part is currently playing it wont change speed to sounded speed as it would if the
   * parameter is omitted).
   * TODO maybe it's better to just store the state on the class instance?
   */
  private _setStateAccordingToNewSettings(oldSettings: ControllerSettings | null = null) {
    if (!oldSettings) {
      this._setSpeedAndLog('sounded');
    } else {
      assert(this._lastActualPlaybackRateChange,
        'Expected it speed to had been set at least at Controller initialization');
      this._setSpeedAndLog(this._lastActualPlaybackRateChange.name);
    }

    this._silenceDetectorNode!.parameters.get('volumeThreshold')!.value = this.settings.volumeThreshold;
    this._silenceDetectorNode!.parameters.get('durationThreshold')!.value =
      this._getSilenceDetectorNodeDurationThreshold();
    if (this.isStretcherEnabled()) {
      this._lookahead.delayTime.value = getNewLookaheadDelay(
        this.settings.marginBefore,
        this.settings.soundedSpeed,
        this.settings.silenceSpeed
      );
      this._stretcher.setDelay(
        getStretcherSoundedDelay(this.settings.marginBefore, this.settings.soundedSpeed, this.settings.silenceSpeed)
      );
    }
  }

  /** Can be called before the instance has been initialized. */
  updateSettings(newSettings: ControllerSettings): void {
    // TODO how about not updating settings that heven't been changed
    const oldSettings = this.settings;
    this.settings = newSettings;

    if (isStretcherEnabled(newSettings) ? !isStretcherEnabled(oldSettings) : isStretcherEnabled(oldSettings)) {
      // TODO this is not async-safe. Add `this.reinitPromise = ` or something.
      setTimeout(async () => {
        await this.destroy();
        await this.init();
      });
      return;
    }

    this._setStateAccordingToNewSettings(oldSettings);
  }

  private _getSilenceDetectorNodeDurationThreshold() {
    const marginBeforeAddition = this.isStretcherEnabled()
      ? this.settings.marginBefore
      : 0;
    return getRealtimeMargin(this.settings.marginAfter + marginBeforeAddition, this.settings.soundedSpeed);
  }

  private _setSpeedAndLog(speedName: 'sounded' | 'silence') {
    let speedVal;
    switch (speedName) {
      case 'sounded': speedVal = this.settings.soundedSpeed; break;
      case 'silence': speedVal = this.settings.silenceSpeed; break;
    }
    this.element.playbackRate = transformSpeed(speedVal);
    this._lastActualPlaybackRateChange = {
      time: this.audioContext!.currentTime,
      value: speedVal,
      name: speedName,
    };
  }

  getTelemetry() {
    assert(this.isInitialized());

    this._analyzerIn.getFloatTimeDomainData(this._volumeInfoBuffer);
    const inputVolume = this._volumeInfoBuffer[this._volumeInfoBuffer.length - 1];

    /**
     * Because of lookahead and stretcher delays, stretches are delayed (duh). This function maps stretch time to where
     * it would be on the input timeline.
     */
    const stretchToInputTime = (stretch: StretchInfo): this['_lastScheduledStretch'] => ({
      ...stretch,
      startTime: stretch.startTime - getTotalDelay(this._lookahead!.delayTime.value, stretch.startValue),
      endTime: stretch.endTime - getTotalDelay(this._lookahead!.delayTime.value, stretch.endValue),
    });

    return {
      unixTime: Date.now() / 1000,
      // videoTime: this.element.currentTime,
      contextTime: this.audioContext.currentTime,
      inputVolume,
      lastActualPlaybackRateChange: this._lastActualPlaybackRateChange,
      totalOutputDelay: this._lookahead && this._stretcher
        ? getTotalDelay(this._lookahead.delayTime.value, this._stretcher.delayNode.delayTime.value)
        : 0,
      // TODO also log `interruptLastScheduledStretch` calls.
      // lastScheduledStretch: this._lastScheduledStretch,
      lastScheduledStretchInputTime: this._lastScheduledStretch && stretchToInputTime(this._lastScheduledStretch),
    };
  }
}
