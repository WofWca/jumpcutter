/**
 * @license
 * Copyright (C) 2020, 2021, 2022, 2023  WofWca <wofwca@protonmail.com>
 *
 * This file is part of Jump Cutter Browser Extension.
 *
 * Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jump Cutter Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
 */

import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';
import { audioContext } from '@/entry-points/content/audioContext';
import {
  getOrCreateMediaElementSourceAndUpdateMap
} from '@/entry-points/content/getOrCreateMediaElementSourceAndUpdateMap';
import {
  getRealtimeMargin,
  getOptimalLookaheadDelay,
  getTotalOutputDelay,
  getDelayFromInputToStretcherOutput,
  maybeClosestNonNormalSpeed,
  destroyAudioWorkletNode,
  isPlaybackActive,
} from '@/entry-points/content/helpers';
import type { StretchInfo, AudioContextTime, UnixTime, TimeDelta, MediaTime } from '@/helpers';
import type { Settings as ExtensionSettings } from '@/settings';
import { ControllerKind } from '@/settings';
import type StretcherAndPitchCorrectorNode from './StretcherAndPitchCorrectorNode';
import { assertDev, SpeedName } from '@/helpers';
import SilenceDetectorNode, { SilenceDetectorEventType, SilenceDetectorMessage }
  from '@/entry-points/content/SilenceDetector/SilenceDetectorNode';
import VolumeFilterNode from '@/entry-points/content/VolumeFilter/VolumeFilterNode';
import type TimeSavedTracker from '@/entry-points/content/TimeSavedTracker';
import {
  setPlaybackRateAndRememberIt,
  setDefaultPlaybackRateAndRememberIt,
} from '../playbackRateChangeTracking';


// Assuming normal speech speed. Looked here https://en.wikipedia.org/wiki/Sampling_(signal_processing)#Sampling_rate
const MIN_HUMAN_SPEECH_ADEQUATE_SAMPLE_RATE = 8000;
const MAX_MARGIN_BEFORE_INTRINSIC_TIME = 0.5;
// Not just MIN_SOUNDED_SPEED, because in theory sounded speed could be greater than silence speed.
const MIN_SPEED = 0.25;
const MAX_MARGIN_BEFORE_REAL_TIME = MAX_MARGIN_BEFORE_INTRINSIC_TIME / MIN_SPEED;

const logging = IS_DEV_MODE && false;

type ControllerInitialized =
  Controller
  & { initialized: true }
  & Required<Pick<Controller, 'initialized' | 'audioContext' | '_silenceDetectorNode'
    | '_analyzerIn' | '_volumeInfoBuffer' | '_lastActualPlaybackRateChange'>>;
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
  clonePlaybackError?: never,
  unixTime: UnixTime,
  intrinsicTime: MediaTime,
  elementPlaybackActive: boolean,
  contextTime: AudioContextTime,
  inputVolume: number,
  lastActualPlaybackRateChange: ControllerInitialized['_lastActualPlaybackRateChange'],
  elementVolume: number,
  totalOutputDelay: TimeDelta,
  delayFromInputToStretcherOutput: TimeDelta,
  stretcherDelay: TimeDelta,
  lastScheduledStretchInputTime?: StretchInfo,
}

function isStretcherEnabled(settings: ControllerSettings) {
  return settings.marginBefore > 0;
}

const getActualPlaybackRateForSpeed = maybeClosestNonNormalSpeed;

/**
 * Controls playback rate (and `.currentTime`) of an `HTMLMediaElement` (like the other ones).
 * Simply listens to the output of the target element. If it's silence, then we speed up.
 *
 * The "stretching" part is trickier. It plays a role when `marginBefore > 0`. Because we're simply
 * listening to the output of the element, we can't directly look ahead its audio, so we can only
 * slow down after a silent part when we've already reached the loud part, so it's impossible
 * to make `marginBefore` work.
 * Or is it? *Vsauce theme starts*
 * What we do is take that `marginBefore` part (which was played at a faster speed because
 * we can't look ahead) and before outputting it to the user we simply time-stretch
 * (and pitch-shift it) so that it's played back at normal speed.
 */
export default class Controller {
  static controllerType = ControllerKind.STRETCHING;

  // I'd be glad to make most of these `private` but this makes it harder to specify types in this file. TODO maybe I'm
  // just too bad at TypeScript.
  readonly element: HTMLMediaElement;
  settings: ControllerSettings;
  initialized = false;
  _resolveInitPromise!: (result: Controller) => void;
  // TODO how about also rejecting it when `init()` throws? Would need to put the whole initialization in the promise
  // executor?
  _initPromise = new Promise<Controller>(resolve => this._resolveInitPromise = resolve);
  // Settings updates that haven't been applied because `updateSettingsAndMaybeCreateNewInstance` was called before
  // `init` finished.
  _pendingSettingsUpdates: ControllerSettings | undefined;

  private _resolveDestroyedPromise!: () => void;
  private _destroyedPromise = new Promise<void>(r => this._resolveDestroyedPromise = r);
  audioContext?: AudioContext;
  _silenceDetectorNode?: SilenceDetectorNode;
  _analyzerIn?: AnalyserNode;
  _volumeInfoBuffer?: Float32Array;
  /**
   * A delay so that we have some time to process the audio before deciding how to manipulate it.
   * You can imagine that what the `HTMLMediaElement` outputs is at the output of this node,
   * and we kind of manage to "look-ahead" what it's going to output by tapping into this
   * node's input.
   * See {@link getOptimalLookaheadDelay} for more.
   */
  _lookahead?: DelayNode;
  _stretcherAndPitch?: StretcherAndPitchCorrectorNode;
  _lastActualPlaybackRateChange?: {
    time: AudioContextTime,
    value: number,
    name: SpeedName,
  };
  _didNotDoDesyncCorrectionForNSpeedSwitches = 0;
  _analyzerOut?: AnalyserNode;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  _log?: (msg?: any) => void;

  constructor(
    videoElement: HTMLMediaElement,
    controllerSettings: ControllerSettings,
    // It's unused in this type of controller for now. Why do we specify it then? It's a hack. See
    // https://github.com/WofWca/jumpcutter/blob/d58946c0654ccc4adc94d31751f006976be2e9d5/src/content/AllMediaElementsController.ts#L68
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    __timeSavedTracker: TimeSavedTracker | Promise<TimeSavedTracker | undefined> | undefined,
  ) {
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

    const toAwait: Array<Promise<void>> = [];

    const {
      playbackRate: elementPlaybackRateBeforeInitialization,
      defaultPlaybackRate: elementDefaultPlaybackRateBeforeInitialization,
    } = element;
    this._destroyedPromise.then(() => {
      setPlaybackRateAndRememberIt(element, elementPlaybackRateBeforeInitialization);
      setDefaultPlaybackRateAndRememberIt(element, elementDefaultPlaybackRateBeforeInitialization);
    });

    this.audioContext = audioContext;

    const addWorkletProcessor = (url: string) =>
      audioContext.audioWorklet.addModule(browserOrChrome.runtime.getURL(url));

    const volumeFilterSmoothingWindowLength = 0.03; // TODO make a setting out of it.
    const volumeFilterProcessorP = addWorkletProcessor('content/VolumeFilterProcessor.js');
    const volumeFilterP = volumeFilterProcessorP.then(() => {
      const volumeFilter = new VolumeFilterNode(
        audioContext,
        volumeFilterSmoothingWindowLength,
        volumeFilterSmoothingWindowLength
      );
      this._destroyedPromise.then(() => destroyAudioWorkletNode(volumeFilter));
      return volumeFilter;
    });
    const silenceDetectorP = addWorkletProcessor('content/SilenceDetectorProcessor.js').then(() => {
      const silenceDetector = new SilenceDetectorNode(audioContext, this._getSilenceDetectorNodeDurationThreshold())
      this._silenceDetectorNode = silenceDetector;
      this._destroyedPromise.then(() => destroyAudioWorkletNode(silenceDetector));
      // So the message handler can no longer be triggered. Yes, I know it's currently being closed anyway on any
      // AudioWorkletNode destruction a line above, but let's future-prove it.
      this._destroyedPromise.then(() => silenceDetector.port.close());
      return silenceDetector;
    });

    this._analyzerIn = audioContext.createAnalyser();
    // Using the minimum possible value for performance, as we're only using the node to get unchanged output values.
    this._analyzerIn.fftSize = 2 ** 5;
    this._volumeInfoBuffer = new Float32Array(this._analyzerIn.fftSize);
    // let outVolumeFilter: this extends ControllerLogging ? AudioWorkletNode : undefined;
    let outVolumeFilterP: Promise<AudioWorkletNode> | undefined;
    if (isLogging(this)) {
      outVolumeFilterP = volumeFilterProcessorP.then(() => {
        const outVolumeFilter = new VolumeFilterNode(
          audioContext,
          volumeFilterSmoothingWindowLength,
          volumeFilterSmoothingWindowLength
        );
        this._destroyedPromise.then(() => destroyAudioWorkletNode(outVolumeFilter));
        return outVolumeFilter;
      });
      this._analyzerOut = audioContext.createAnalyser();
    }
    // Actually this check is not required as the extension handles marginBefore being 0 and stretcher being enabled
    // well. This is purely for performance. TODO?
    if (this.isStretcherEnabled()) {
      this._lookahead = audioContext.createDelay(MAX_MARGIN_BEFORE_REAL_TIME);
      const { default: StretcherAndPitchCorrectorNode } = await import(
        /* webpackExports: ['default'] */
        './StretcherAndPitchCorrectorNode'
      );
      const maxSpeedToPreserveSpeech = audioContext.sampleRate / MIN_HUMAN_SPEECH_ADEQUATE_SAMPLE_RATE;
      const maxMaginStretcherDelay = MAX_MARGIN_BEFORE_REAL_TIME * (maxSpeedToPreserveSpeech / MIN_SPEED);
      this._stretcherAndPitch = new StretcherAndPitchCorrectorNode(
        audioContext,
        maxMaginStretcherDelay,
        0, // Doesn't matter, we'll update it in `_setStateAccordingToNewSettings`.
        () => this.settings,
        () => this._lookahead!.delayTime.value,
      );
      this._destroyedPromise.then(() => this._stretcherAndPitch!.destroy());
    }

    {
      // This is mainly to reduce CPU consumption while the video is paused. Also gets rid of slight misbehaviors like
      // speed always becoming silenceSpeed when media element gets paused, which causes a guaranteed audio stretch on
      // resume.
      // TODO This causes a bug - start playing two media elements (on the same <iframe>), then pause one - both will get
      // silenced. Nobody really does that, but still.
      // Tbh I don't remember why we're using a single `audioContext`. Probably because it
      // used to be good enough, and saved some memory on not creating a bunch of contexts.
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
      element.addEventListener('pause', scheduleSuspendAudioContext, { passive: true });
      element.addEventListener('play', resumeAudioContext, { passive: true });
      this._destroyedPromise.then(() => {
        element.removeEventListener('pause', scheduleSuspendAudioContext);
        element.removeEventListener('play', resumeAudioContext);
        resumeAudioContext(); // In case the video is paused.
      });
    }

    const [, mediaElementSource] = getOrCreateMediaElementSourceAndUpdateMap(
      element,
      () => audioContext
    );
    let toDestinationChainLastConnectedLink: { connect: (destinationNode: AudioNode) => void }
      = mediaElementSource;
    if (this.isStretcherEnabled()) {
      mediaElementSource.connect(this._lookahead);
      this._stretcherAndPitch.connectInputFrom(this._lookahead);
      toDestinationChainLastConnectedLink = this._stretcherAndPitch;
    }
    toAwait.push(volumeFilterP.then(async volumeFilter => {
      mediaElementSource.connect(volumeFilter);
      this._destroyedPromise.then(() => {
        // This is so the next line doesn't throw in case it is already disconnected (e.g. by some other
        // onDestroyCallback). The spec says this is fine:
        // https://webaudio.github.io/web-audio-api/#dom-audionode-connect
        // "Multiple connections with the same termini are ignored."
        mediaElementSource.connect(volumeFilter);
        mediaElementSource.disconnect(volumeFilter);
      });
      volumeFilter.connect(this._analyzerIn!);
      const silenceDetector = await silenceDetectorP;
      volumeFilter.connect(silenceDetector);
    }));
    toDestinationChainLastConnectedLink.connect(audioContext.destination);

    this._destroyedPromise.then(() => {
      mediaElementSource.disconnect();
      mediaElementSource.connect(audioContext.destination);
    });

    if (isLogging(this)) {
      toAwait.push(outVolumeFilterP!.then(outVolumeFilter => {
        if (this.isStretcherEnabled()) {
          this._stretcherAndPitch.connect(outVolumeFilter);
        } else {
          mediaElementSource.connect(outVolumeFilter);
        }
        outVolumeFilter.connect(this._analyzerOut!);
      }));
    }

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
          t: audioContext.currentTime,
          // delay: stretcherInitialDelay, // TODO fix this. It's not `initialDelay` it should be `stretcher.delay`
          speed: element.playbackRate,
          inVol,
          outVol,
        });
      }
    }

    toAwait.push(silenceDetectorP.then(silenceDetector => {
      silenceDetector.port.onmessage = ({ data }: MessageEvent<SilenceDetectorMessage>) => {
        const [silenceStartOrEnd] = data;
        let elementSpeedSwitchedAt: AudioContextTime;
        if (silenceStartOrEnd === SilenceDetectorEventType.SILENCE_END) {
          // Keep in mind that we need to do `el.playbackRate =` as fast as possible here in order to not
          // skip over the start of the sentence.
          // TODO improvement: how about get `elementSpeedSwitchedAt` from 'ratechange' e.timestamp?
          elementSpeedSwitchedAt = this._setSpeedAndLog(SpeedName.SOUNDED);
          // But we're not really in a hurry to perform `onSilenceEnd` or `onSilenceStart` because there's
          // a lookahead delay (this._lookahear) so the sound doesn't get output immediately.
          // https://github.com/WofWca/jumpcutter/blob/81b4e507b68d9f7c50e90161326edc65038ae28c/src/entry-points/content/helpers/getOptimalLookaheadDelay.ts#L30-L37
          // TODO improvement: unlikely, but maybe putting everything that follows `el.playbackRate =`
          // in a `setTimeout / queueMicrotask` could make the browser actually switch the speed faster?
          // Or is it always performed synchronously?
          // https://html.spec.whatwg.org/multipage/media.html#dom-media-playbackrate
          this._stretcherAndPitch?.onSilenceEnd(elementSpeedSwitchedAt);
        } else {
          elementSpeedSwitchedAt = this._setSpeedAndLog(SpeedName.SILENCE);
          this._stretcherAndPitch?.onSilenceStart(elementSpeedSwitchedAt);

          if (BUILD_DEFINITIONS.BROWSER_MAY_HAVE_AUDIO_DESYNC_BUG && this.settings.enableDesyncCorrection) {
            // A workaround for
            // https://bugs.chromium.org/p/chromium/issues/detail?id=1231093
            // (or https://github.com/vantezzen/skip-silence/issues/28).
            // Idea: https://github.com/vantezzen/skip-silence/issues/28#issuecomment-714317921
            // TODO remove it when/if it's fixed in Chromium. Or make the period adjustable.
            // Or keep for older browsers (and disable for newer)?
            // Gecko doesn't have this problem (anymore?). Maybe thanks to this
            // https://bugzilla.mozilla.org/show_bug.cgi?id=1712595
            // It actually doesn't get noticeably out of sync for about 50 switches, but upon correction there is a
            // noticeable rewind in sound, so we use a smaller value.
            // Why on silenceStart, not on silenceEnd? Becasue when it's harder to notice a rewind when it's silent.
            // `marginAfter` ensures there's plenty of it.
            // Actually, I don't experience any inconveniences even when it's set to 1. But rewinds actually create short
            // pauses, so let's give it some bigger value.
            const DO_DESYNC_CORRECTION_EVERY_N_SPEED_SWITCHES = 10;
            // Yes, we only increase the counter when switching to silenceSpeed, which makes the name incorrect.
            // Cry about it.
            this._didNotDoDesyncCorrectionForNSpeedSwitches++;
            if (
              this._didNotDoDesyncCorrectionForNSpeedSwitches >= DO_DESYNC_CORRECTION_EVERY_N_SPEED_SWITCHES
              // At least on YouTube, when the video is ended, performing a really short seek
              // causes it to start over for some reason:
              // https://github.com/WofWca/jumpcutter/issues/91
              && !element.ended
            ) {
              // `+=` actually makes more sense to me here because the past frames might get
              // discarded by the browser and maybe it'll have to re-buffer them. But
              // based on a bit of testing using seeking with `+=` took 132ms on average,
              // while `-=` 103.6. So I'll not be touching it for now.
              element.currentTime -= 1e-9;
              // TODO but it's also corrected when the user seeks the video manually.
              this._didNotDoDesyncCorrectionForNSpeedSwitches = 0;
            }
          }
        }

        // The delay between a message getting sent from `AudioWorkletProcessor` and
        // it getting received here, on the main thread, seems to be the bottleneck.
        // It takes from 0.005s to 0.020s (equal to an event cycle, right?), so I don't
        // think optimizing anything other than this sent-to-received delay is worth the effort.
        // I wish we could change `el.playbackRate` directly from `AudioWorkletProcessor`.
        if (IS_DEV_MODE) {
          const messageSentAt = data[1];
          const delayS = elementSpeedSwitchedAt - messageSentAt;
          if (delayS > 0.03) {
            console.warn(`elementSpeedSwitchedAt - messageSentAt === ${delayS}s`);
          }
        }
      }
      // IDK why, but not doing this causes a pretty solid memory leak when you enable-disable the extension
      // (like 200 kB per toggle).
      // Not doint this in `ElementPlaybackControllerCloning/Lookahead.ts` does not appear
      // to cause a memory leak for some reason.
      // Doing `this._silenceDetectorNode = null` does not get rid of it, so I think the AudioWorkletNode is the only
      // thing retaining a reference to the listener. TODO
      this._destroyedPromise.then(() => silenceDetector.port.onmessage = null);
    }));

    if (isLogging(this)) {
      const logIntervalId = (setInterval as typeof window.setInterval)(() => {
        this._log!();
      }, 1);
      this._destroyedPromise.then(() => clearInterval(logIntervalId));
    }

    await Promise.all(toAwait);

    this.initialized = true;
    this._resolveInitPromise(this);

    Object.assign(this.settings, this._pendingSettingsUpdates);
    this._setStateAccordingToNewSettings(this.settings, null);
    delete this._pendingSettingsUpdates;

    return this;
  }

  /**
   * Assumes `init()` to has been or will be called (but not necessarily that its return promise has been resolved),
   * othersie it will never resolve its promise.
   * TODO make it work when it's false?
   */
  async destroy(): Promise<void> {
    // `await this._initPromise` because the `init` function has side-effects (e.g. doing
    // `elementMediaSource.disconnect()`) (which it should, because it's supposed to CONTROL the element),
    // so the outside scipt needs to make sure that two `init` methods from two different controllers
    // don't get executed at the same time for the same element (e.g. if we need to swtich from one controller
    // type to another).
    await this._initPromise; // TODO would actually be better to interrupt it if it's still going.
    assertDev(this.isInitialized());

    this._resolveDestroyedPromise();

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
  private _setStateAccordingToNewSettings(newSettings: ControllerSettings, oldSettings: ControllerSettings | null) {
    this.settings = newSettings;
    assertDev(this.isInitialized());

    // https://html.spec.whatwg.org/multipage/media.html#loading-the-media-resource:dom-media-defaultplaybackrate
    // The most common case where `load` is called is when the current source is replaced with an ad (or
    // the opposite, when the ad ends).
    // It's also a good practice.
    // https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource:dom-media-defaultplaybackrate-2
    setDefaultPlaybackRateAndRememberIt(
      this.element,
      getActualPlaybackRateForSpeed(
        this.settings.soundedSpeed,
        this.settings.volumeThreshold
      )
    );

    if (!oldSettings) {
      this._lastActualPlaybackRateChange = {
        // Dummy values, will be ovewritten immediately in `_setSpeedAndLog`.
        name: SpeedName.SOUNDED,
        time: 0,
        value: 1,
      }
      this._setSpeedAndLog(SpeedName.SOUNDED);
    } else {
      this._setSpeedAndLog(this._lastActualPlaybackRateChange.name);
    }

    this._silenceDetectorNode.volumeThreshold = this.settings.volumeThreshold;
    this._silenceDetectorNode.durationThreshold = this._getSilenceDetectorNodeDurationThreshold();
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

    const needReinit = isStretcherEnabled(newSettings)
      ? !isStretcherEnabled(oldSettings)
      : isStretcherEnabled(oldSettings);
    if (needReinit) {
      const newInstance = new Controller(this.element, newSettings, undefined);
      this.destroy().then(() => newInstance.init());
      return newInstance;
    } else {
      if (this.initialized) {
        this._setStateAccordingToNewSettings(newSettings, oldSettings);
      } else {
        this._pendingSettingsUpdates = newSettings;
      }
      return this;
    }
  }

  private _getSilenceDetectorNodeDurationThreshold() {
    const marginBeforeAddition = this.settings.marginBefore;
    assertDev(this.isStretcherEnabled() ? marginBeforeAddition > 0 : marginBeforeAddition === 0,
      'Currently the stretcher should only be enabled when marginBefore > 0 and vice versa?');
    return getRealtimeMargin(this.settings.marginAfter + marginBeforeAddition, this.settings.soundedSpeed);
  }

  /**
   * @returns elementSpeedSwitchedAt
   */
  private _setSpeedAndLog(speedName: SpeedName): AudioContextTime {
    const speedVal = getActualPlaybackRateForSpeed(
      speedName === SpeedName.SOUNDED
        ? this.settings.soundedSpeed
        : this.settings.silenceSpeed,
      this.settings.volumeThreshold
    );
    setPlaybackRateAndRememberIt(this.element, speedVal);
    const elementSpeedSwitchedAt = this.audioContext!.currentTime;

    if (IS_DEV_MODE) {
      if (speedName === SpeedName.SOUNDED) {
        assertDev(
          this.element.playbackRate === this.element.defaultPlaybackRate,
          `Switched to soundedSpeed, but \`soundedSpeed !== defaultPlaybackRate\`:`
          + ` ${this.element.playbackRate} !== ${this.element.defaultPlaybackRate}`
          + 'Perhaps `defaultPlaybackRate` was updated outside of this extension'
          + ', or you forgot to update it yourself. It\'s not a major problem, just a heads-up'
        );
      }
    }

    const obj = this._lastActualPlaybackRateChange;
    assertDev(obj);
    // Avoiding creating new objects for performance.
    obj.time = elementSpeedSwitchedAt;
    obj.value = speedVal;
    obj.name = speedName;
    return elementSpeedSwitchedAt;
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
      // I heard accessing DOM is not very efficient, so maybe we could instead utilize `addPlaybackStopListener` and
      // 'ratechange' and infer `element.currentTime` from that?
      intrinsicTime: this.element.currentTime,
      elementPlaybackActive: isPlaybackActive(this.element),
      contextTime: this.audioContext.currentTime,
      inputVolume,
      lastActualPlaybackRateChange: this._lastActualPlaybackRateChange,
      elementVolume: this.element.volume,
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
