'use strict';
import browser from '@/webextensions-api';
import { audioContext, mediaElementSourcesMap } from './audioContext';
import {
  getRealtimeMargin,
  getOptimalLookaheadDelay,
  getTotalOutputDelay,
  getDelayFromInputToStretcherOutput,
  transformSpeed,
} from './helpers';
import type { Time, StretchInfo } from '@/helpers';
import type { Settings as ExtensionSettings } from '@/settings';
import type StretcherAndPitchCorrectorNode from './StretcherAndPitchCorrectorNode';
import { assertDev, SpeedName } from '@/helpers';
import SilenceDetectorNode, { SilenceDetectorEventType, SilenceDetectorMessage }
  from './SilenceDetector/SilenceDetectorNode';
import VolumeFilterNode from './VolumeFilter/VolumeFilterNode';


// Assuming normal speech speed. Looked here https://en.wikipedia.org/wiki/Sampling_(signal_processing)#Sampling_rate
const MIN_HUMAN_SPEECH_ADEQUATE_SAMPLE_RATE = 8000;
const MAX_MARGIN_BEFORE_INTRINSIC_TIME = 0.5;
// Not just MIN_SOUNDED_SPEED, because in theory sounded speed could be greater than silence speed.
const MIN_SPEED = 0.25;
const MAX_MARGIN_BEFORE_REAL_TIME = MAX_MARGIN_BEFORE_INTRINSIC_TIME / MIN_SPEED;

const logging = process.env.NODE_ENV !== 'production';

type ControllerInitialized =
  Controller
  & { initialized: true }
  & Required<Pick<Controller, 'initialized' | 'audioContext' | '_silenceDetectorNode'
    | '_analyzerIn' | '_volumeInfoBuffer' | '_lastActualPlaybackRateChange' | '_elementVolumeCache'>>;
type ControllerWithStretcher = Controller & Required<Pick<Controller, '_lookahead' | '_stretcherAndPitch'>>;
type ControllerLogging = Controller & Required<Pick<Controller, '_log' | '_analyzerOut'>>;

// Not a method so it gets eliminated at optimization.
const isLogging = (controller: Controller): controller is ControllerLogging => logging;

export type ControllerSettings =
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

export interface TelemetryRecord {
  unixTime: Time,
  contextTime: Time,
  inputVolume: number,
  lastActualPlaybackRateChange: ControllerInitialized['_lastActualPlaybackRateChange'],
  elementVolume: number,
  totalOutputDelay: Time,
  delayFromInputToStretcherOutput: Time,
  stretcherDelay: Time,
  lastScheduledStretchInputTime?: StretchInfo,
}

function isStretcherEnabled(settings: ControllerSettings) {
  return settings.marginBefore > 0;
}

function destroyAudioWorkletNode(node: AudioWorkletNode) {
  node.port.postMessage('destroy');
  node.port.close();
}

export default class Controller {
  // I'd be glad to make most of these `private` but this makes it harder to specify types in this file. TODO maybe I'm
  // just too bad at TypeScript.
  readonly element: HTMLMediaElement;
  settings: ControllerSettings;
  initialized = false;
  _resolveInitPromise!: (result: Controller) => void;
  // TODO how about also rejecting it when `init()` throws? Would need to put the whole initialization in the promise
  // executor?
  _initPromise = new Promise<Controller>(resolve => this._resolveInitPromise = resolve);

  _onDestroyCallbacks: Array<() => void> = [];
  audioContext?: AudioContext;
  _silenceDetectorNode?: SilenceDetectorNode;
  _analyzerIn?: AnalyserNode;
  _volumeInfoBuffer?: Float32Array;
  _lookahead?: DelayNode;
  _stretcherAndPitch?: StretcherAndPitchCorrectorNode;
  _lastActualPlaybackRateChange?: {
    time: Time,
    value: number,
    name: SpeedName,
  };
  _elementVolumeCache?: number; // Same as element.volume, but faster.
  _didNotDoDesyncCorrectionForNSpeedSwitches = 0;
  _analyzerOut?: AnalyserNode;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  _log?: (msg?: any) => void;

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
    const element = this.element;
    const ctx = audioContext;

    const {
      playbackRate: elementPlaybackRateBeforeInitialization,
      defaultPlaybackRate: elementDefaultPlaybackRateBeforeInitialization,
    } = element;
    this._onDestroyCallbacks.push(() => {
      element.playbackRate = elementPlaybackRateBeforeInitialization;
      element.defaultPlaybackRate = elementDefaultPlaybackRateBeforeInitialization;
    });

    this._elementVolumeCache = element.volume;
    const onElementVolumeChange = () => this._elementVolumeCache = element.volume;
    element.addEventListener('volumechange', onElementVolumeChange);
    this._onDestroyCallbacks.push(() => element.removeEventListener('volumechange', onElementVolumeChange));

    this.audioContext = ctx;

    await Promise.all([
      ctx.audioWorklet.addModule(browser.runtime.getURL('content/SilenceDetectorProcessor.js')),
      ctx.audioWorklet.addModule(browser.runtime.getURL('content/VolumeFilterProcessor.js')),
    ]);

    const volumeFilterSmoothingWindowLength = 0.03; // TODO make a setting out of it.
    const volumeFilter = new VolumeFilterNode(ctx, volumeFilterSmoothingWindowLength, volumeFilterSmoothingWindowLength);
    this._onDestroyCallbacks.push(() => destroyAudioWorkletNode(volumeFilter));
    this._silenceDetectorNode = new SilenceDetectorNode(ctx, this._getSilenceDetectorNodeDurationThreshold());
    this._onDestroyCallbacks.push(() => destroyAudioWorkletNode(this._silenceDetectorNode!));
    // So the message handler can no longer be triggered. Yes, I know it's currently being closed anyway on any
    // AudioWorkletNode destruction a line above, but let's future-prove it.
    this._onDestroyCallbacks.push(() => this._silenceDetectorNode!.port.close())
    this._analyzerIn = ctx.createAnalyser();
    // Using the minimum possible value for performance, as we're only using the node to get unchanged output values.
    this._analyzerIn.fftSize = 2 ** 5;
    this._volumeInfoBuffer = new Float32Array(this._analyzerIn.fftSize);
    // let outVolumeFilter: this extends ControllerLogging ? AudioWorkletNode : undefined;
    let outVolumeFilter: AudioWorkletNode | undefined;
    if (isLogging(this)) {
      outVolumeFilter = new VolumeFilterNode(ctx, volumeFilterSmoothingWindowLength, volumeFilterSmoothingWindowLength);
      this._onDestroyCallbacks.push(() => destroyAudioWorkletNode(outVolumeFilter!));
      this._analyzerOut = ctx.createAnalyser();
    }
    // Actually this check is not required as the extension handles marginBefore being 0 and stretcher being enabled
    // well. This is purely for performance. TODO?
    if (this.isStretcherEnabled()) {
      this._lookahead = ctx.createDelay(MAX_MARGIN_BEFORE_REAL_TIME);
      const { default: StretcherAndPitchCorrectorNode } = await import(
        /* webpackExports: ['default'] */
        './StretcherAndPitchCorrectorNode'
      );
      const maxSpeedToPreserveSpeech = ctx.sampleRate / MIN_HUMAN_SPEECH_ADEQUATE_SAMPLE_RATE;
      const maxMaginStretcherDelay = MAX_MARGIN_BEFORE_REAL_TIME * (maxSpeedToPreserveSpeech / MIN_SPEED);
      this._stretcherAndPitch = new StretcherAndPitchCorrectorNode(
        ctx,
        maxMaginStretcherDelay,
        0, // Doesn't matter, we'll update it in `_setStateAccordingToNewSettings`.
        () => this.settings,
        () => this._lookahead!.delayTime.value,
      );
      this._onDestroyCallbacks.push(() => this._stretcherAndPitch!.destroy());
    }

    // This is mainly to reduce CPU consumption while the video is paused. Also gets rid of slight misbehaviors like
    // speed always becoming silenceSpeed when media element gets paused, which causes a guaranteed audio stretch on
    // resume.
    // TODO This causes a bug - start playing two media elements (on the same <iframe>), then pause one - both will get
    // silenced. Nobody really does that, but still.
    const suspendAudioContext = () => audioContext.suspend();
    let suspendAudioContextTimeoutId: number | undefined;
    const scheduleSuspendAudioContext = () => {
      clearTimeout(suspendAudioContextTimeoutId); // Just in case, e.g. `scheduleSuspendAudioContext` is called twice.

      // Isn't this too much calculation? Maybe doing `(settings.marginBefore + settings.marginAfter) * 10` would be
      // enough?
      const totalTailTime = getTotalOutputDelay(
        this._lookahead?.delayTime.value ?? 0,
        this._stretcherAndPitch?.stretcherDelay ?? 0,
        this._stretcherAndPitch?.pitchCorrectorDelay ?? 0,
      );
      // Maybe I'm calculating `totalTailTime` wrong, but it appears it's not enough – try settings `marginBefore` to
      // a high value (e.g. 0.5s) and pause the element on a sounded part, then unpause it -
      // as soon as you unpause you'll hear sound, then silence for 0.5s, then sound again (i.e. the
      // first piece of sound is not supposed to be there, it was supposed to be done playing in that tail-time
      // before `audioContext.suspend()`).
      const safetyMargin = 0.02;
      suspendAudioContextTimeoutId = (setTimeout as typeof window.setTimeout)(
        suspendAudioContext,
        (totalTailTime + safetyMargin) * 1000
      );
    };
    const resumeAudioContext = () => {
      clearTimeout(suspendAudioContextTimeoutId);
      audioContext.resume();
    };
    if (element.paused) {
      suspendAudioContext();
    }
    element.addEventListener('pause', scheduleSuspendAudioContext);
    element.addEventListener('play', resumeAudioContext);
    this._onDestroyCallbacks.push(() => {
      element.removeEventListener('pause', scheduleSuspendAudioContext);
      element.removeEventListener('play', resumeAudioContext);
      resumeAudioContext(); // In case the video is paused.
    });

    const srcFromMap = mediaElementSourcesMap.get(element);
    let mediaElementSource: MediaElementAudioSourceNode;
    if (srcFromMap) {
      mediaElementSource = srcFromMap;
      mediaElementSource.disconnect();
    } else {
      mediaElementSource = ctx.createMediaElementSource(element);
      mediaElementSourcesMap.set(element, mediaElementSource)
    }
    if (this.isStretcherEnabled()) {
      mediaElementSource.connect(this._lookahead);
    } else {
      mediaElementSource.connect(audioContext.destination);
    }
    mediaElementSource.connect(volumeFilter);
    this._onDestroyCallbacks.push(() => {
      mediaElementSource.disconnect();
      mediaElementSource.connect(audioContext.destination);
    });
    volumeFilter.connect(this._silenceDetectorNode);
    if (this.isStretcherEnabled()) {
      this._stretcherAndPitch.connectInputFrom(this._lookahead);
      this._stretcherAndPitch.connectOutputTo(ctx.destination);
    }
    volumeFilter.connect(this._analyzerIn);
    if (isLogging(this)) {
      if (this.isStretcherEnabled()) {
        this._stretcherAndPitch.connectOutputTo(outVolumeFilter!);
      } else {
        mediaElementSource.connect(outVolumeFilter!);
      }
      outVolumeFilter!.connect(this._analyzerOut);
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
          speed: element.playbackRate,
          inVol,
          outVol,
        });
      }
    }

    this._silenceDetectorNode.port.onmessage = (msg) => {
      const silenceStartOrEnd = msg.data as SilenceDetectorMessage;
      const elementSpeedSwitchedAt = ctx.currentTime;
      if (silenceStartOrEnd === SilenceDetectorEventType.SILENCE_END) {
        this._setSpeedAndLog(SpeedName.SOUNDED);
        this._stretcherAndPitch?.onSilenceEnd(elementSpeedSwitchedAt);
      } else {
        this._setSpeedAndLog(SpeedName.SILENCE);
        this._stretcherAndPitch?.onSilenceStart(elementSpeedSwitchedAt);

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
          const DO_DESYNC_CORRECTION_EVERY_N_SPEED_SWITCHES = 10;
          this._didNotDoDesyncCorrectionForNSpeedSwitches++;
          if (this._didNotDoDesyncCorrectionForNSpeedSwitches >= DO_DESYNC_CORRECTION_EVERY_N_SPEED_SWITCHES) {
            element.currentTime -= 1e-9;
            // TODO but it's also corrected when the user seeks the video manually.
            this._didNotDoDesyncCorrectionForNSpeedSwitches = 0;
          }
        }
      }
    }
    // IDK why, but not doing this causes a pretty solid memory leak when you enable-disable the extension
    // (like 200 kB per toggle).
    // Doing `this._silenceDetectorNode = null` does not get rid of it, so I think the AudioWorkletNode is the only
    // thing retaining a reference to the listener. TODO
    this._onDestroyCallbacks.push(() => this._silenceDetectorNode!.port.onmessage = null);
    if (isLogging(this)) {
      const logIntervalId = (setInterval as typeof window.setInterval)(() => {
        this._log!();
      }, 1);
      this._onDestroyCallbacks.push(() => clearInterval(logIntervalId));
    }

    this.initialized = true;
    this._resolveInitPromise(this);
    return this;
  }

  /**
   * Assumes `init()` to has been or will be called (but not necessarily that its return promise has been resolved).
   * TODO make it work when it's false?
   */
  async destroy(): Promise<void> {
    await this._initPromise; // TODO would actually be better to interrupt it if it's still going.
    assertDev(this.isInitialized());

    for (const cb of this._onDestroyCallbacks) {
      cb();
    }

    // TODO make sure built-in nodes (like gain) are also garbage-collected (I think they should be).
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
      this._setSpeedAndLog(SpeedName.SOUNDED);
    } else {
      assertDev(this._lastActualPlaybackRateChange,
        'Expected it speed to had been set at least at Controller initialization');
      this._setSpeedAndLog(this._lastActualPlaybackRateChange.name);
    }

    this._silenceDetectorNode!.volumeThreshold = this.settings.volumeThreshold;
    this._silenceDetectorNode!.durationThreshold = this._getSilenceDetectorNodeDurationThreshold();
    if (this.isStretcherEnabled()) {
      this._lookahead.delayTime.value = getOptimalLookaheadDelay(
        this.settings.marginBefore,
        this.settings.soundedSpeed,
        this.settings.silenceSpeed
      );
      this._stretcherAndPitch.onSettingsUpdate();
    }
  }

  /**
   * May return a new unitialized instance of its class, if particular settings are changed. The old one gets destroyed
   * and must not be used. The new instance will get initialized automatically and may not start initializing
   * immediately (waiting for the old one to get destroyed).
   * Can be called before the instance has been initialized.
   */
  updateSettingsAndMaybeCreateNewInstance(newSettings: ControllerSettings): Controller {
    // TODO how about not updating settings that heven't been changed
    const oldSettings = this.settings;
    this.settings = newSettings;

    if (isStretcherEnabled(newSettings) ? !isStretcherEnabled(oldSettings) : isStretcherEnabled(oldSettings)) {
      const newInstance = new Controller(this.element, this.settings);
      this.destroy().then(() => newInstance.init());
      return newInstance;
    } else {
      this._setStateAccordingToNewSettings(oldSettings);
      return this;
    }
  }

  private _getSilenceDetectorNodeDurationThreshold() {
    const marginBeforeAddition = this.isStretcherEnabled()
      ? this.settings.marginBefore
      : 0;
    return getRealtimeMargin(this.settings.marginAfter + marginBeforeAddition, this.settings.soundedSpeed);
  }

  private _setSpeedAndLog(speedName: SpeedName) {
    let speedVal;
    switch (speedName) {
      case SpeedName.SOUNDED: {
        speedVal = transformSpeed(this.settings.soundedSpeed);
        // https://html.spec.whatwg.org/multipage/media.html#loading-the-media-resource:dom-media-defaultplaybackrate
        // The most common case where `load` is called is when the current source is replaced with an ad (or
        // the opposite, when the ad ends).
        // It's also a good practice.
        // https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource:dom-media-defaultplaybackrate-2
        this.element.defaultPlaybackRate = speedVal;
        break;
      }
      case SpeedName.SILENCE: speedVal = transformSpeed(this.settings.silenceSpeed); break;
    }
    this.element.playbackRate = speedVal;
    this._lastActualPlaybackRateChange = {
      time: this.audioContext!.currentTime,
      value: speedVal,
      name: speedName,
    };
  }

  get telemetry(): TelemetryRecord {
    assertDev(this.isInitialized());

    this._analyzerIn.getFloatTimeDomainData(this._volumeInfoBuffer);
    const inputVolume = this._volumeInfoBuffer[this._volumeInfoBuffer.length - 1];

    const lookaheadDelay = this._lookahead?.delayTime.value ?? 0;
    const stretcherDelay = this._stretcherAndPitch?.stretcherDelay ?? 0;

    /**
     * Because of lookahead and stretcher delays, stretches are delayed (duh). This function maps stretch time to where
     * it would be on the input timeline.
     */
    const stretchToInputTime = (stretch: StretchInfo): StretchInfo => ({
      ...stretch,
      startTime: stretch.startTime - getDelayFromInputToStretcherOutput(lookaheadDelay, stretch.startValue),
      endTime: stretch.endTime - getDelayFromInputToStretcherOutput(lookaheadDelay, stretch.endValue),
    });

    return {
      unixTime: Date.now() / 1000,
      // IntrinsicTime: this.element.currentTime,
      contextTime: this.audioContext.currentTime,
      inputVolume,
      lastActualPlaybackRateChange: this._lastActualPlaybackRateChange,
      elementVolume: this._elementVolumeCache,
      totalOutputDelay: getTotalOutputDelay(
        lookaheadDelay,
        stretcherDelay,
        this._stretcherAndPitch?.pitchCorrectorDelay ?? 0,
      ),
      delayFromInputToStretcherOutput: getDelayFromInputToStretcherOutput(lookaheadDelay, stretcherDelay),
      stretcherDelay,
      // TODO also log `interruptLastScheduledStretch` calls.
      // lastScheduledStretch: this._stretcherAndPitch.lastScheduledStretch,
      lastScheduledStretchInputTime:
        this._stretcherAndPitch?.lastScheduledStretch
        && stretchToInputTime(this._stretcherAndPitch.lastScheduledStretch),
    };
  }
}
