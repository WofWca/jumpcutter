/**
 * @license
 * Copyright (C) 2021, 2022  WofWca <wofwca@protonmail.com>
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

import browser from '@/webextensions-api';
import Lookahead, { TimeRange } from './Lookahead';
import { assertDev, AudioContextTime, SpeedName } from '@/helpers';
import type { MediaTime, AnyTime } from '@/helpers';
import { isPlaybackActive, destroyAudioWorkletNode, requestIdleCallbackPolyfill,
  maybeClosestNonNormalSpeed } from '@/entry-points/content/helpers';
import { ControllerKind } from '@/settings';
import type { Settings as ExtensionSettings } from '@/settings';
import throttle from 'lodash/throttle';
import type TimeSavedTracker from '@/entry-points/content/TimeSavedTracker';
import VolumeFilterNode from '@/entry-points/content/VolumeFilter/VolumeFilterNode';
import lookaheadVolumeFilterSmoothing from './lookaheadVolumeFilterSmoothing.json'
import {
  audioContext as commonAudioContext,
  getOrCreateMediaElementSourceAndUpdateMap
} from '@/entry-points/content/audioContext';
import {
  setPlaybackRateAndRememberIt,
  setDefaultPlaybackRateAndRememberIt,
} from '../playbackRateChangeTracking';

type Time = AnyTime;

type ControllerInitialized =
  Controller
  & { initialized: true }
  & Required<Pick<Controller, 'initialized'>>;

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
  intrinsicTime: MediaTime,
  elementPlaybackActive: boolean,
  contextTime: Time,
  inputVolume: number,
  lastActualPlaybackRateChange: {
    time: Time,
    value: number,
    name: SpeedName,
  },
  lastSilenceSkippingSeek?: TimeRange,
  elementVolume: number,
  totalOutputDelay: Time,
  delayFromInputToStretcherOutput: Time,
  stretcherDelay: Time,
  lastScheduledStretchInputTime?: undefined,
}

const seekDurationProphetHistoryLength = 5;
const seekDurationProphetNoDataInitialAssumedDuration = 150;
/**
 * Tells us how long (based on previous data) the next seek is gonna take.
 */
class SeekDurationProphet {
  el: HTMLMediaElement
  // TODO replace with a ring buffer (we have one in `VolumeFilterProcessor`)?
  history: number[] = [];
  historyAverage = seekDurationProphetNoDataInitialAssumedDuration;
  public destroy!: () => void;
  private _destroyedPromise = new Promise<void>(r => this.destroy = r);
  // Keep in mind that it is possible for the constructor to be called after a 'seeking' event has
  // been fired, but before 'seeked'. `performance.now()` is not technically correct, but
  // handling this being `undefined` separately seems worse.
  lastSeekStartTime: number = performance.now();
  constructor (el: HTMLMediaElement) {
    this.el = el;
    // Keep in mind that 'seeking' can be fired more than once before 'seeked' is fired, if the previous
    // seek didn't manage to finish.
    const onSeeking = this.onSeeking.bind(this);
    const onSeeked = this.onSeeked.bind(this);
    el.addEventListener('seeking', onSeeking, { passive: true });
    el.addEventListener('seeked', onSeeked, { passive: true });
    this._destroyedPromise.then(() => {
      el.removeEventListener('seeking', onSeeking);
      el.removeEventListener('seeked', onSeeked);
    })
  }
  onSeeking(e: Event) {
    this.lastSeekStartTime = e.timeStamp;

    // TODO probably need to take into account whether a seek has been performed into an unbuffered range
    // and adjust the seek duration accordingly or not consider it at all.
    // if (inRanges(this.el.buffered, this.el.currentTime))
  }
  onSeeked(e: Event) {
    const seekDuration = e.timeStamp - this.lastSeekStartTime;

    // if (seekDuration > 2000) return;

    this.history.push(seekDuration);
    // TODO performance - once this becomes `true`, it will never cease to.
    if (this.history.length > seekDurationProphetHistoryLength) {
      this.history.shift();
    }
    // TODO performance - only have consider the removed and the added element, not recalculate the whole array
    // every time
    const sum = this.history.reduce((acc, curr) => acc + curr);
    this.historyAverage = sum / this.history.length;
  }
  get nextSeekDurationMs(): number {
    return this.historyAverage;
  }
}

const DO_DESYNC_CORRECTION_EVERY_N_SPEED_SWITCHES = 20;

const getActualPlaybackRateForSpeed = maybeClosestNonNormalSpeed;

// TODO a lot of stuff is copy-pasted from ElementPlaybackControllerStretching.
/**
 * Controls playback rate (and `.currentTime`) of an `HTMLMediaElement` (like the other ones).
 * Searches for silent parts by creating a new hidden `HTMLMediaElement` with the same `src` as the
 * target one and playing it separately, in advance of the target one.
 */
export default class Controller {
  static controllerType = ControllerKind.CLONING;

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
  audioContext: AudioContext;
  getVolume: () => number = () => 0;
  _lastSilenceSkippingSeek: TimeRange | undefined;
  _lastActualPlaybackRateChange: {
    time: AudioContextTime,
    value: number,
    // name: SpeedName.SOUNDED,
    name: SpeedName,
  } = {
    // Dummy values (except for `name`), will be ovewritten in `_setSpeedAndLog`.
    name: SpeedName.SOUNDED,
    time: 0,
    value: 1,
  };

  lookahead?: Lookahead;

  // To be (optionally) assigned by an outside script.
  public timeSavedTracker?: TimeSavedTracker;

  seekDurationProphet: SeekDurationProphet;

  _didNotDoDesyncCorrectionForNSpeedSwitches = 0;

  constructor(
    element: HTMLMediaElement,
    controllerSettings: ControllerSettings,
    timeSavedTracker: TimeSavedTracker | Promise<TimeSavedTracker | undefined> | undefined,
  ) {
    this.element = element;
    this.settings = controllerSettings;

    const lookahead = this.lookahead = new Lookahead(element, this.settings);
    // Destruction is performed in `this.destroy` directly.
    lookahead.ensureInit();

    if (timeSavedTracker instanceof Promise) {
      timeSavedTracker.then(tracker => this.timeSavedTracker = tracker);
    } else {
      this.timeSavedTracker = timeSavedTracker;
    }

    this.seekDurationProphet = new SeekDurationProphet(element);
    this._destroyedPromise.then(() => this.seekDurationProphet.destroy());

    // We don't need a high sample rate as this context is currently only used to volume on the chart,
    // so consider setting it manually to a lower one. But I'm thinking whether it woruld actually
    // add performance overhead instead (would make resampling harder or something).
    const audioContext = this.audioContext = new AudioContext({
      latencyHint: 'playback',
    });
    this._destroyedPromise.then(() => {
      audioContext.close();
    })
  }

  isInitialized(): this is ControllerInitialized {
    return this.initialized;
  }

  async init(): Promise<void> {
    const element = this.element;

    const toAwait : Array<Promise<void>> = [];

    const {
      playbackRate: elementPlaybackRateBeforeInitialization,
      defaultPlaybackRate: elementDefaultPlaybackRateBeforeInitialization,
    } = element;
    this._destroyedPromise.then(() => {
      setPlaybackRateAndRememberIt(element, elementPlaybackRateBeforeInitialization);
      setDefaultPlaybackRateAndRememberIt(element, elementDefaultPlaybackRateBeforeInitialization);
    });

    toAwait.push(this.lookahead!.ensureInit().then(() => {
      // TODO Super inefficient, I know.
      const onTimeupdate = () => {
        this.maybeScheduleMaybeSeekOrSpeedup();
      }
      element.addEventListener('timeupdate', onTimeupdate, { passive: true });
      this._destroyedPromise.then(() => element.removeEventListener('timeupdate', onTimeupdate));
    }));

    const onNewSrc = () => {
      // This indicated that `element.currentSrc` has changed.
      // https://html.spec.whatwg.org/multipage/media.html#dom-media-currentsrc
      // > Its value is changed by the resource selection algorithm
      this.destroyAndThrottledInitLookahead();
    }
    element.addEventListener('loadstart', onNewSrc, { passive: true });
    this._destroyedPromise.then(() => element.removeEventListener('loadstart', onNewSrc));

    // Why `onNewSrc` is not enough? Because a 'timeupdate' event gets emited before 'loadstart', so
    // 'maybeScheduleMaybeSeekOrSpeedup' gets executed, and it tries to use the lookahead that was
    // used for the previous source, so if the previous source started with silence, a seek
    // will be performed immediately on the new source.
    const onOldSrcGone = () => {
      this.lookahead?.destroy();
      this.lookahead = undefined;
    }
    element.addEventListener('emptied', onOldSrcGone, { passive: true });
    this._destroyedPromise.then(() => element.removeEventListener('emptied', onOldSrcGone));

    {
      // This is not strictly necessary, so not pushing anything to `toAwait`.
      //
      // Why not `createMediaElementSource`? Because:
      // * There's a risk that the element would get muted due to CORS-restrictions.
      // * I believe performance drops may cause audio to glitch when it passes through an AudioContext,
      //     so it's better to do it raw.
      // But `captureStream` is not well-supported.
      // Also keep in mind that `createMediaElementSource` and `captureStream` are not 100% interchangeable.
      // For example, for `el.volume` doesn't affect the volume for `captureStream()`.
      // TODO fall-back to `createMediaElementSource` if these are not supported?
      type HTMLMediaElementWithMaybeMissingFields = HTMLMediaElement & {
        captureStream?: () => MediaStream,
        mozCaptureStream?: () => MediaStream,
      }
      const element_ = element as HTMLMediaElementWithMaybeMissingFields;
      const unprefixedCaptureStreamPresent = element_.captureStream;
      const browserGecko = BUILD_DEFINITIONS.BROWSER === 'gecko';
      const captureStream =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (unprefixedCaptureStreamPresent && (() => element_.captureStream!()))
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        || (browserGecko && element_.mozCaptureStream && (() => element_.mozCaptureStream!()));

      if (captureStream) {
        // Also mostly copy-pasted from `ElementPlaybackControllerStretching`.
        const audioContext = this.audioContext;
        const addWorkletProcessor = (url: string) => audioContext.audioWorklet.addModule(browser.runtime.getURL(url));
        // Must be the same so what the user sees matches what the lookahead sees.
        const volumeFilterSmoothingWindowLength = lookaheadVolumeFilterSmoothing;
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

        // The following paragraph is pretty stupid because Web Audio API is still pretty new.
        // Or because I'm pretty new to it.
        let source: MediaStreamAudioSourceNode;
        let reinitScheduled = false;
        const reinit = () => {
          source?.disconnect();
          let newStream;
          // `try` because see the `catch` block.
          try {
            newStream = captureStream();
          } catch (e) {
            if (IS_DEV_MODE) {
              console.warn('Couldn\'t `captureStream`, but ignoring it because maybe we\'re here because'
                + ' `dontAttachToCrossOriginMedia` is `false` and the media is CORS-restricted', e);
            }
          }
          if (newStream) {
            // Shouldn't we do something if there are no tracks?
            if (newStream.getAudioTracks().length) {
              source = audioContext.createMediaStreamSource(newStream);
              volumeFilterP.then(filter => source.connect(filter));
            }
          }

          reinitScheduled = false;
        }
        const ensureReinitDeferred = () => {
          if (!reinitScheduled) {
            reinitScheduled = true;
            requestIdleCallbackPolyfill(reinit, { timeout: 2000 });
          }
        }

        // This means that the 'playing' has already been emited.
        // https://html.spec.whatwg.org/multipage/media.html#mediaevents:event-media-playing
        const nowPlaying = element.readyState > HTMLMediaElement.HAVE_FUTURE_DATA && !element.paused;
        const canCaptureStreamNow = nowPlaying;
        if (canCaptureStreamNow) {
          reinit();
        }
        const alreadyInitialized = canCaptureStreamNow;

        // Workaround for
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1178751
        if (BUILD_DEFINITIONS.BROWSER === 'gecko') {
          const mozCaptureStreamUsed = !unprefixedCaptureStreamPresent;
          if (mozCaptureStreamUsed) {
            const mediaElementSource = getOrCreateMediaElementSourceAndUpdateMap(element);
            mediaElementSource.connect(commonAudioContext.destination);
          }
        }

        // Hopefully this covers all cases where the `MediaStreamAudioSourceNode` stops working.
        // 'loadstart' is for when the source changes, 'ended' speaks for itself.
        // https://w3c.github.io/mediacapture-fromelement/#dom-htmlmediaelement-capturestream
        let unhandledLoadstartOrEndedEvent = alreadyInitialized ? false : true;
        const onPlaying = () => {
          if (unhandledLoadstartOrEndedEvent) {
            ensureReinitDeferred();
            unhandledLoadstartOrEndedEvent = false;
          }
        }
        element.addEventListener('playing', onPlaying, { passive: true });
        this._destroyedPromise.then(() => element.removeEventListener('playing', onPlaying));
        const onEndedOrLoadstart = () => {
          unhandledLoadstartOrEndedEvent = true;
        }
        element.addEventListener('loadstart', onEndedOrLoadstart, { passive: true });
        element.addEventListener('ended', onEndedOrLoadstart, { passive: true });
        this._destroyedPromise.then(() => {
          element.removeEventListener('loadstart', onEndedOrLoadstart);
          element.removeEventListener('ended', onEndedOrLoadstart);
        });

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2 ** 5;
        volumeFilterP.then(volumeFilter => {
          volumeFilter.connect(analyser);
        });
        // Using the minimum possible value for performance, as we're only using the node to get unchanged
        // output values.
        const volumeBuffer = new Float32Array(analyser.fftSize);
        const volumeBufferLastInd = volumeBuffer.length - 1;
        this.getVolume = () => {
          analyser.getFloatTimeDomainData(volumeBuffer);
          return volumeBuffer[volumeBufferLastInd];
        };
      } else {
        this.getVolume = () => 0;
      }
    }

    await Promise.all(toAwait);
    this.initialized = true;
    this._resolveInitPromise(this);

    Object.assign(this.settings, this._pendingSettingsUpdates);
    this._setStateAccordingToNewSettings(this.settings, null);
    delete this._pendingSettingsUpdates;
  }

  maybeSeekOrSpeedupTimeoutId = -1;
  /**
   * Look at the upcoming silent part and maybe schedule a call
   * to {@link Controller.maybeSeekOrSpeedup} to skip it.
   */
  maybeScheduleMaybeSeekOrSpeedup() {
    const { currentTime } = this.element;
    const maybeUpcomingSilenceRange = this.lookahead?.getNextSilenceRange(currentTime);
    if (!maybeUpcomingSilenceRange) {
      return;
    }
    const [silenceStart, silenceEnd] = maybeUpcomingSilenceRange;
    // TODO would it be maybe better to also just do nothing if the next silence range is too far, and
    // `setTimeout` only when it gets closer (so `if (seekInRealTime > 10) return;`? Would time accuracy
    // increase?
    const seekAt = Math.max(silenceStart, currentTime);
    const seekTo = silenceEnd;
    const seekInVideoTime = seekAt - currentTime;
    const seekInRealTime = seekInVideoTime / this.settings.soundedSpeed;
    // Yes, this means that `maybeUpcomingSilenceRange` may be the same on two subsequent
    // 'timeupdate' handler calls, and each of them would unconditionally call this `setTimeout`.
    // This case is handled inside `this.maybeSeekOrSpeedup`.
    //
    // Just so the seek is performed a bit faster compared to `setTimeout`.
    // TODO not very effective because `maybeSeekOrSpeedup` performs some checks that are
    // unnecessary when it is called immediately (and not by `setTimeout`).
    clearTimeout(this.maybeSeekOrSpeedupTimeoutId);
    // TODO should this be `<= expectedMinSetTimeoutDelay` instead of `<= 0`?
    if (seekInRealTime <= 0) {
      this.maybeSeekOrSpeedup(seekTo, seekAt);
    } else {
      this.maybeSeekOrSpeedupTimeoutId = (setTimeout as typeof window.setTimeout)(
        this.maybeSeekOrSpeedupBounded,
        seekInRealTime * 1000,
        seekTo,
        seekAt,
      );
    }
  }
  /**
   * Perform a seek to skip silence, or increase `playbackRate` if seeking is not good enough.
   * Or don't do either if neither actually saves time, or under some other circumstances.
   * This function is usually called with `setTimeout`, this is why it looks weird.
   * @param seekTo where to seek (currently it's always the end of a silent part).
   * @param seekScheduledTo what `el.currentTime` time we wanted this function to be called at.
   */
  maybeSeekOrSpeedup(seekTo: MediaTime, seekScheduledTo: MediaTime): void {
    const element = this.element;
    const { currentTime, paused } = element;

    // In cases where a seek is scheduled ahead of time, some event may happen that makes it better to not perform this
    // seek. For example, if the user decided to manually seek to some other time, or if I suck at coding and performed
    // a conflicting seek.
    // TODO perf: would be more efficient to `clearTimeout` instead. On what occasions though?
    const expectedCurrentTime = seekScheduledTo;
    const cancelSeek =
      Math.abs(currentTime - expectedCurrentTime) > 0.5 // E.g. if the user seeked manually to some other time
      || paused;
    if (cancelSeek) {
      return;
    }

    const seekAmount = seekTo - currentTime;
    const expectedSeekDuration = this.seekDurationProphet.nextSeekDurationMs / 1000;

    if (IS_DEV_MODE) {
      if (expectedSeekDuration < 0.010) {
        console.warn(
          '`expectedSeekDuration` got lower than 0.010, but we ignore silence ranges that are shorter than this.'
          + ' See `pushNewSilenceRange` in `ElementPlaybackControllerCloning/Lookahead.ts`'
        );
      }
    }

    const realTimeLeftUntilDestinationWithoutSeeking = seekAmount / this.settings.soundedSpeed;
    // TODO just use `fastSeek`?
    // TODO should we maybe also calculate it before `setTimeout(maybeSeekOrSpeedup)`?
    // Also even if seeking was instant, when you perform one the new `currentTime` can be a bit lower (or bigger)
    // than the value that you assigned to it, so `seekTo !== currentTime` would not work.
    const farEnoughToPerformSeek = realTimeLeftUntilDestinationWithoutSeeking > expectedSeekDuration;
    const needForceSeekForDesyncCorrection = () => {
      let forceSeekForDesyncCorrection = false;
      if (BUILD_DEFINITIONS.BROWSER_MAY_HAVE_AUDIO_DESYNC_BUG && this.settings.enableDesyncCorrection) {
        // Desync correction is crucial for ElementPlaybackControllerCloning because
        // otherwise we'll start skipping at incorrect time. Apparently it's audio that
        // gets out of sync with `el.currentTime`, not video.
        // TODO maybe then it even makes sense to ignore whether `enableDesyncCorrection === false`?
  
        // In order to save more time, we don't simply check if
        // `this._didNotDoDesyncCorrectionForNSpeedSwitches >= DO_DESYNC_CORRECTION_EVERY_N_SPEED_SWITCHES`.
        // It is better to perform desync correction when `realTimeLeftUntilDestinationWithoutSeeking`
        // is _barely_ below `expectedSeekDuration` even if `this._didNotDoDesyncCorrectionForNSpeedSwitches`
        // did not reach `DO_DESYNC_CORRECTION_EVERY_N_SPEED_SWITCHES` so we don't have to do it later, possibly when
        // `realTimeLeftUntilDestinationWithoutSeeking` is super small.
        // Yes, this means that we seek more often than `DO_DESYNC_CORRECTION_EVERY_N_SPEED_SWITCHES`, but I believe
        // that it's beneficial.
        // Perhaps there is a better way to describe this.
        const howMuchWeWantDesyncCorrection =
          this._didNotDoDesyncCorrectionForNSpeedSwitches / DO_DESYNC_CORRECTION_EVERY_N_SPEED_SWITCHES;
        const howMuchWeWantToSeek =
          realTimeLeftUntilDestinationWithoutSeeking / (expectedSeekDuration || Number.MIN_VALUE);
        const howMuchWeDontWantToSeek = 1 - howMuchWeWantToSeek;
        if (howMuchWeWantDesyncCorrection >= howMuchWeDontWantToSeek) {
          forceSeekForDesyncCorrection = true;
        }
      }
      return forceSeekForDesyncCorrection;
    }
    if (farEnoughToPerformSeek || needForceSeekForDesyncCorrection()) {
      element.currentTime = seekTo;
      this._didNotDoDesyncCorrectionForNSpeedSwitches = 0;

      // It's very rough and I think it can skip the start of a sounded part. Also not supported in Chromium.
      // Also see the comment about seeking error above. TODO?
      // element.fastSeek(seekTo);

      // TODO it's wrong to pass only the `expectedSeekDuration` instead of the real one, but it's better
      // than passing 0.
      this.timeSavedTracker?.onControllerCausedSeek(seekTo - currentTime, expectedSeekDuration);

      this._lastSilenceSkippingSeek = [seekScheduledTo, seekTo];
    } else {
      // This also happens right after we perform a seek (because 'timeupdate' gets fired). It's fine though
      // because of `farEnoughToSpeedUp`.

      // TOOD but the `silenceSpeed` input is disabled. Maybe then we could use a constant value instead of
      // `this.settings.silenceSpeed`? Need to make sure to clamp it (`getAbsoluteClampedSilenceSpeed`).
      // If so, don't forget to change `_setSpeedAndLog` (because it accepts `SpeedName`).
      const newSpeed = this.settings.silenceSpeed;
      const realTimeLeftUntilDestinationAtSilenceSpeed = seekAmount / newSpeed
      const expectedMinimumSetTimeoutDelay = 1 / 60; // TODO determine this dynamically, as with `expectedSeekDuration`.
      // TODO but maybe otherwise we could simply use a smaller value of silenceSpeed instead of not speeding up
      // at all?
      let farEnoughToSpeedUp = realTimeLeftUntilDestinationAtSilenceSpeed > expectedMinimumSetTimeoutDelay;
      if (BUILD_DEFINITIONS.BROWSER_MAY_HAVE_AUDIO_DESYNC_BUG && this.settings.enableDesyncCorrection) {
        const expectedTimeSavedBySpeedingUp = seekAmount / this.settings.soundedSpeed - seekAmount / newSpeed;
        // Due to high `expectedSeekDuration` it may not be woth speeding up because each speedup increases desync.
        const oneSpeedupDesyncCorrectionTimeCost =
          expectedSeekDuration / DO_DESYNC_CORRECTION_EVERY_N_SPEED_SWITCHES;
        farEnoughToSpeedUp &&= expectedTimeSavedBySpeedingUp > oneSpeedupDesyncCorrectionTimeCost;
      }

      if (farEnoughToSpeedUp) {
        // TODO what if `realTimeLeftUntilDestinationAtSilenceSpeed` is pretty big? Need to cancel this if
        // the user seeks to a sounded place.
        // May be other caveats.

        this._setSpeedAndLog(SpeedName.SILENCE);
        setTimeout(
          () => this._setSpeedAndLog(SpeedName.SOUNDED),
          realTimeLeftUntilDestinationAtSilenceSpeed * 1000,
        );
        // Yes, there's actually two speed switches, but we increment it just once. Need to refactor.
        // Same in ElementPlaybackControllerStretching.
        this._didNotDoDesyncCorrectionForNSpeedSwitches++;
      }
    }
  }
  maybeSeekOrSpeedupBounded = this.maybeSeekOrSpeedup.bind(this);

  /**
   * Assumes `init()` to has been or will be called (but not necessarily that its return promise has been resolved),
   * othersie it will never resolve its promise.
   * TODO refactor: make it work when it's false?
   */
  async destroy(): Promise<void> {
    // `await this._initPromise` because the `init` function has side-effects (e.g. doing
    // `elementMediaSource.disconnect()`) (which it should, because it's supposed to CONTROL the element),
    // so the outside scipt needs to make sure that two `init` methods from two different controllers
    // don't get executed at the same time for the same element (e.g. if we need to swtich from one controller
    // type to another).
    await this._initPromise; // TODO would actually be better to interrupt it if it's still going.
    assertDev(this.isInitialized());

    this._throttledInitLookahead.cancel();
    this.lookahead?.destroy();

    this._resolveDestroyedPromise();

    // TODO refactor: make sure built-in nodes (like gain) are also garbage-collected (I think they should be).
  }

  private _initLookahead() {
    const lookahead = this.lookahead = new Lookahead(this.element, this.settings);
    // Destruction is performed in `this.destroy` directly.
    lookahead.ensureInit();
  }
  private _throttledInitLookahead = throttle(this._initLookahead, 1000);
  private destroyAndThrottledInitLookahead() {
    this.lookahead?.destroy();
    this.lookahead = undefined;
    this._throttledInitLookahead();
  }

  /**
   * Can be called either when initializing or when updating settings.
   * TODO It's more performant to only update the things that rely on settings that changed, in a reactive way, but for
   * now it's like this so its harder to forget to update something.
   * @param oldSettings - better to provide this so the current state can be reconstructed and
   * respected (e.g. if a silent part is currently playing it wont change speed to sounded speed as it would if the
   * parameter is omitted).
   * TODO refactor: maybe it's better to just store the state on the class instance?
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

    // TODO do it as we do in ElementPlaybackControllerStretching, not always SOUNDED?
    // Fine for now though.
    this._setSpeedAndLog(SpeedName.SOUNDED);
    const lookaheadSettingsChanged =
      oldSettings && (
        newSettings.volumeThreshold !== oldSettings.volumeThreshold
        || newSettings.marginBefore !== oldSettings.marginBefore
        || newSettings.marginAfter !== oldSettings.marginAfter
      )
    if (lookaheadSettingsChanged) {
      // TODO inefficient. Better to add an `updateSettings` method to `Lookahead`.
      this.destroyAndThrottledInitLookahead();
    }
    // The previously scheduled `maybeSeekOrSpeedup` became scheduled to an incorrect time because
    // of this (so `Math.abs(currentTime - expectedCurrentTime)` inside `maybeSeekOrSpeedup`
    // will be big).
    if (newSettings.soundedSpeed !== oldSettings?.soundedSpeed) {
      clearTimeout(this.maybeSeekOrSpeedupTimeoutId);
      this.maybeScheduleMaybeSeekOrSpeedup();
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
    if (this.initialized) {
      const oldSettings = this.settings;
      this._setStateAccordingToNewSettings(newSettings, oldSettings);
    } else {
      this._pendingSettingsUpdates = newSettings;
    }

    return this;
  }

  private _setSpeedAndLog(speedName: SpeedName) {
    // Need to `maybeClosestNonNormalSpeed` because even in this algorithm we switch speeds. Not always though.
    const speedVal = getActualPlaybackRateForSpeed(
      speedName === SpeedName.SOUNDED
        ? this.settings.soundedSpeed
        : this.settings.silenceSpeed,
      this.settings.volumeThreshold
    );
    setPlaybackRateAndRememberIt(this.element, speedVal);
    const elementSpeedSwitchedAt = this.audioContext.currentTime;

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
    // return elementSpeedSwitchedAt;
  }

  get telemetry(): TelemetryRecord {
    assertDev(this.isInitialized());
    // TODO that's a lot of 0s, can we do something about it?
    return {
      unixTime: Date.now() / 1000,
      intrinsicTime: this.element.currentTime,
      elementPlaybackActive: isPlaybackActive(this.element),
      contextTime: this.audioContext.currentTime,
      inputVolume: this.getVolume(),
      lastActualPlaybackRateChange: this._lastActualPlaybackRateChange,
      lastSilenceSkippingSeek: this._lastSilenceSkippingSeek,
      elementVolume: this.element.volume,
      totalOutputDelay: 0,
      delayFromInputToStretcherOutput: 0,
      stretcherDelay: 0,
      // TODO also log `interruptLastScheduledStretch` calls.
      // lastScheduledStretch: this._stretcherAndPitch.lastScheduledStretch,
      lastScheduledStretchInputTime: undefined,
    };
  }
}
