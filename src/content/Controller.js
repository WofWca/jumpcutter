'use strict';
import { audioContext, mediaElementSourcesMap } from './audioContext';
import {
  getRealtimeMargin,
  getNewLookaheadDelay,
  getTotalDelay,
  getStretcherDelayChange,
  getStretcherSoundedDelay,
  getMomentOutputTime,
} from './helpers';
import defaultSettings from '../defaultSettings.json';

/**
 * @typedef Settings
 * @type {typeof defaultSettings}
 */

/**
 * @param {Settings} settings 
 */
function isStretcherEnabled(settings) {
  return settings.enableExperimentalFeatures;
}

// Assuming normal speech speed. Looked here https://en.wikipedia.org/wiki/Sampling_(signal_processing)#Sampling_rate
const MIN_HUMAN_SPEECH_ADEQUATE_SAMPLE_RATE = 8000;
const MAX_MARGIN_BEFORE_VIDEO_TIME = 0.5;
// Not just MIN_SOUNDED_SPEED, because in theory sounded speed could be greater than silence speed.
const MIN_SPEED = 0.25;
const MAX_MARGIN_BEFORE_REAL_TIME = MAX_MARGIN_BEFORE_VIDEO_TIME / MIN_SPEED;

const logging = process.env.NODE_ENV !== 'production';

export default class Controller {
  /**
   * @param {HTMLVideoElement} videoElement
   * @param {Settings} settings
   */
  constructor(videoElement, settings) {
    this.element = videoElement;
    this.settings = settings;
    this.initialized = false;
  }

  async init() {
    let resolveInitPromise;
    // TODO how about also rejecting it when `init()` throws? Would need to put the whole initialization in the promise
    // executor?
    this._initPromise = new Promise(resolve => resolveInitPromise = resolve);

    const ctx = audioContext;
    this.audioContext = ctx;
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
    let outVolumeFilter, analyzerOut;
    if (logging) {
      outVolumeFilter = new AudioWorkletNode(ctx, 'VolumeFilter', {
        outputChannelCount: [1],
      });
      analyzerOut = ctx.createAnalyser();
    }
    if (isStretcherEnabled(this.settings)) {
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
    if (isStretcherEnabled(this.settings)) {
      this._mediaElementSource.connect(this._lookahead);
    } else {
      this._mediaElementSource.connect(audioContext.destination);
    }
    this._mediaElementSource.connect(this._volumeFilter);
    this._volumeFilter.connect(this._silenceDetectorNode);
    if (isStretcherEnabled(this.settings)) {
      this._stretcher.connectInputFrom(this._lookahead);
      this._stretcher.connectOutputTo(ctx.destination);
    }
    this._volumeFilter.connect(this._analyzerIn);
    if (logging) {
      if (isStretcherEnabled(this.settings)) {
        this._stretcher.connectOutputTo(outVolumeFilter);
      } else {
        this._mediaElementSource.connect(outVolumeFilter);
      }
      outVolumeFilter.connect(analyzerOut);
    }
    this._setStateAccordingToNewSettings();

    this._lastScheduledStretch = null;

    let logArr, logBuffer;
    if (logging) {
      logArr = [];
      logBuffer = new Float32Array(analyzerOut.fftSize);
      this._log = (msg = null) => {
        analyzerOut.getFloatTimeDomainData(logBuffer);
        const outVol = logBuffer[logBuffer.length - 1];
        this._analyzerIn.getFloatTimeDomainData(logBuffer);
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

        if (isStretcherEnabled(this.settings)) {
          this._doOnSilenceEndStretcherStuff(eventTime);
        }
      } else {
        this._setSpeedAndLog('silence');

        if (isStretcherEnabled(this.settings)) {
          this._doOnSilenceStartStretcherStuff(eventTime);
        }
      }
    }
    if (logging) {
      setInterval(() => {
        this._log();
      }, 1);
    }

    this.initialized = true;
    resolveInitPromise(this);
    return this;
  }

  /**
   * This only changes the state of `this._stretcher`
   * @param {number} eventTime 
   */
  _doOnSilenceEndStretcherStuff(eventTime) {
    // TODO all this does look like it may cause a snowballing floating point error. Mathematically simplify this?
    // Or just use if-else?

    const lastScheduledStretcherDelayReset = this._lastScheduledStretch;

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
      if (logging) {
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
    if (logging) {
      this._log({ type: 'stretch', lastScheduledStretch: this._lastScheduledStretch });
    }
  }
  /**
   * @see this._doOnSilenceEndStretcherStuff
   * @param {number} eventTime 
   */
  _doOnSilenceStartStretcherStuff(eventTime) {
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

    if (logging) {
      this._log({ type: 'reset', lastScheduledStretch: this._lastScheduledStretch });
    }
  }

  /**
   * Assumes `init()` has been called (but not necessarily that its return promise has been resolved).
   * TODO make it work when it's false?
   */
  async destroy() {
    await this._initPromise; // TODO would actually be better to interrupt it if it's still going.

    this._mediaElementSource.disconnect();
    this._mediaElementSource.connect(audioContext.destination);


    this._silenceDetectorNode.port.close(); // So the message handler can no longer be triggered.

    if (isStretcherEnabled(this.settings)) {
      this._stretcher.destroy();
    }
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
   * @param {Settings | null} oldSettings - better to provide this so the current state can be reconstructed and
   * respected (e.g. if a silent part is currently playing it wont change speed to sounded speed as it would if the
   * parameter is omitted).
   * TODO maybe it's better to just store the state on the class instance?
   */
  _setStateAccordingToNewSettings(oldSettings = null) {
    if (!oldSettings) {
      this._setSpeedAndLog('sounded');
    } else {
      const currSpeedName = ['silence', 'sounded'].find(
        speedName => this.element.playbackRate === oldSettings[`${speedName}Speed`]
      );
      if (currSpeedName) {
        this._setSpeedAndLog(currSpeedName);
      }
    }

    this._silenceDetectorNode.parameters.get('volumeThreshold').value = this.settings.volumeThreshold;
    this._silenceDetectorNode.parameters.get('durationThreshold').value =
      this._getSilenceDetectorNodeDurationThreshold();
    if (isStretcherEnabled(this.settings)) {
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

  /**
   * Can be called before the instance has been initialized.
   * @param {Partial<Settings>} newChangedSettings
   */
  updateSettings(newChangedSettings) {
    const oldSettings = this.settings;
    /**
     * @type {Settings} For me intellisense sets `this.settings` to `any` if I remove this. Time to move to TypeScript.
     */
    const newSettings = {
      ...this.settings,
      ...newChangedSettings,
    };

    // TODO check for all unknown/unsupported settings. Don't allow passing them at all, warn?
    if (process.env.NODE_ENV !== 'production') {
      if (oldSettings.enableExperimentalFeatures !== oldSettings.enableExperimentalFeatures) {
        throw new Error('Chaning this setting with this method is not supported. Re-create the instance instead');
      }
    }

    this.settings = newSettings;
    this._setStateAccordingToNewSettings(oldSettings);
  }

  _getSilenceDetectorNodeDurationThreshold() {
    const marginBeforeAddition = isStretcherEnabled(this.settings)
      ? this.settings.marginBefore
      : 0;
    return getRealtimeMargin(this.settings.marginAfter + marginBeforeAddition, this.settings.soundedSpeed);
  }

  /**
   * @param {'sounded' | 'silence'} speedName
   */
  _setSpeedAndLog(speedName) {
    const speedVal = this.settings[`${speedName}Speed`];
    this.element.playbackRate = speedVal;
    this._lastActualPlaybackRateChange = {
      time: this.audioContext.currentTime,
      value: speedVal,
      name: speedName,
    };
  }

  getTelemetry() {
    if (!this.initialized) {
      return null;
    }
    this._analyzerIn.getFloatTimeDomainData(this._volumeInfoBuffer);
    const inputVolume = this._volumeInfoBuffer[this._volumeInfoBuffer.length - 1];

    /**
     * Because of lookahead and stretcher delays, stretches are delayed (duh). This function maps stretch time to where
     * it would be on the input timeline.
     * @param {Controller['_lastScheduledStretch']} stretch
     * @returns {Controller['_lastScheduledStretch']}
     */
    const stretchToInputTime = (stretch) => ({
      ...stretch,
      startTime: stretch.startTime - getTotalDelay(this._lookahead.delayTime.value, stretch.startValue),
      endTime: stretch.endTime - getTotalDelay(this._lookahead.delayTime.value, stretch.endValue),
    });

    return {
      unixTime: Date.now() / 1000,
      videoTime: this.element.currentTime,
      contextTime: this.audioContext.currentTime,
      inputVolume,
      lastActualPlaybackRateChange: this._lastActualPlaybackRateChange,
      // TODO also log `interruptLastScheduledStretch` calls.
      lastScheduledStretch: this._lastScheduledStretch,
      lastScheduledStretchInputTime: this._lastScheduledStretch && stretchToInputTime(this._lastScheduledStretch),
    };
  }
}
