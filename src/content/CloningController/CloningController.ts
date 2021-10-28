import Lookahead from './Lookahead';
import type { MediaTime, AnyTime } from '@/helpers';
import type { Settings as ExtensionSettings } from '@/settings';
import { ControllerKind } from '@/settings';
import { assertDev, SpeedName } from '@/helpers';
import throttle from 'lodash/throttle';
import type TimeSavedTracker from '@/content/TimeSavedTracker';

type Time = AnyTime;

type ControllerInitialized =
  Controller
  & { initialized: true }
  & Required<Pick<Controller, 'initialized' | '_elementVolumeCache'>>;

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
  lastActualPlaybackRateChange: {
    time: Time,
    value: number,
    name: SpeedName,
  },
  elementVolume: number,
  totalOutputDelay: Time,
  delayFromInputToStretcherOutput: Time,
  stretcherDelay: Time,
  lastScheduledStretchInputTime?: undefined,
}

// TODO a lot of stuff is copy-pasted from StretchingController.
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

  _onDestroyCallbacks: Array<() => void> = [];
  _elementVolumeCache?: number; // Same as element.volume, but faster.

  lookahead: Lookahead;

  // To be (optionally) assigned by an outside script.
  public timeSavedTracker?: TimeSavedTracker;

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
  }

  isInitialized(): this is ControllerInitialized {
    return this.initialized;
  }

  async init(): Promise<void> {
    const element = this.element;

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
    element.addEventListener('volumechange', onElementVolumeChange, { passive: true });
    this._onDestroyCallbacks.push(() => element.removeEventListener('volumechange', onElementVolumeChange));

    const { lookahead } = this;
    const maybeSeek = this.maybeSeek.bind(this);
    // TODO Super inefficient, I know.
    const onTimeupdate = () => {
      const { currentTime } = element;

      // Can't just use `currentTime` instead of `upcomingTime` because 'timeupdate' is not fired super often,
      // so `silenceStart` from `getMaybeSilenceRangeForTime` can be significantly greater than `currentTime`,
      // which would mean that we should have started a seek a bit earlier.
      // TODO but this still does not save us from the fact that short silence ranges can be overlooked entirely
      // (i.e. `silenceStart > currentTime && silenceEnd > currentTime`).
      // The value is based on how often 'timeupdate' is fired. TODO should make this dynamic?
      const advance = 0.5;
      const upcomingTime = currentTime + advance;
      const maybeUpcomingSilenceRange = this.lookahead.getMaybeSilenceRangeForTime(upcomingTime);
      if (!maybeUpcomingSilenceRange) {
        return;
      }
      const [silenceStart, silenceEnd] = maybeUpcomingSilenceRange;
      const seekAt = Math.max(silenceStart, currentTime);
      const seekTo = silenceEnd;
      const seekInVideoTime = seekAt - currentTime;
      const seekInRealTime = seekInVideoTime / this.settings.soundedSpeed;
      // Yes, this means that `getMaybeSilenceRangeForTime` may return the same silence range
      // on two subsequent 'timeupdate' handler calls, and each of them would unconditionally call this `setTimeout`.
      // This case is handled inside `this.maybeSeek`.
      //
      // Just so the seek is performed a bit faster compared to `setTimeout`.
      // TODO not very effective because `maybeSeek` performs some checks that are unnecessary when it is
      // called immediately (and not by `setTimeout`).
      if (seekInRealTime <= 0) {
        maybeSeek(seekTo, seekAt);
      } else {
        setTimeout(
          maybeSeek,
          seekInRealTime * 1000,
          seekTo,
          seekAt,
        );
      }
    }

    // This indicated that `element.currentSrc` has changed.
    // https://html.spec.whatwg.org/multipage/media.html#dom-media-currentsrc
    // > Its value is changed by the resource selection algorithm
    const onNewSrc = () => this.throttledReinitLookahead();
    element.addEventListener('loadstart', onNewSrc);
    this._onDestroyCallbacks.push(() => element.removeEventListener('timeupdate', onNewSrc));

    await lookahead.ensureInit().then(() => {
      element.addEventListener('timeupdate', onTimeupdate, { passive: true });
      this._onDestroyCallbacks.push(() => element.removeEventListener('timeupdate', onTimeupdate));
    });

    this.initialized = true;
    this._resolveInitPromise(this);

    Object.assign(this.settings, this._pendingSettingsUpdates);
    this._setStateAccordingToNewSettings(this.settings, null);
    delete this._pendingSettingsUpdates;
  }

  maybeSeek(seekTo: MediaTime, seekScheduledTo: MediaTime): void {
    const element = this.element;
    const { currentTime, paused } = element;

    // In cases where a seek is scheduled ahead of time, some event may happen that makes it better to not perform this
    // seek. For example, if the user decided to manually seek to some other time, or if I suck at coding and performed
    // a conflicting seek.
    // TODO would be more efficient to `clearTimeout` instead. On what occasions though?
    const expectedCurrentTime = seekScheduledTo;
    const cancelSeek =
      Math.abs(currentTime - expectedCurrentTime) > 0.5 // E.g. if the user seeked manually to some other time
      || paused;
    if (cancelSeek) {
      return;
    }

    const seekAmount = seekTo - currentTime;
    // Based on a bit of testing, it appears that it usually takes 20-200ms to perform
    // a precise seek (`.currentTime = ...`).
    const expectedSeekDuration = 0.15;
    const realTimeLeftUntilDestinationWithoutSeeking = seekAmount / this.settings.soundedSpeed;
    // TODO just use `fastSeek`?
    // TODO should we maybe also calculate it before `setTimeout(maybeSeek)`?
    // Also even if seeking was instant, when you perform one the new `currentTime` can be a bit lower (or bigger)
    // than the value that you assigned to it, so `seekTo !== currentTime` would not work.
    const farEnoughToPerformSeek = realTimeLeftUntilDestinationWithoutSeeking > expectedSeekDuration;
    if (farEnoughToPerformSeek) {
      element.currentTime = seekTo;

      // It's very rough and I think it can skip the start of a sounded part. Also not supported in Chromium.
      // Also see the comment about seeking error above. TODO?
      // element.fastSeek(seekTo);

      this.timeSavedTracker?.onControllerCausedSeek(seekTo - currentTime);
    }
  }

  /**
   * Assumes `init()` to has been or will be called (but not necessarily that its return promise has been resolved).
   * TODO make it work when it's false?
   */
  async destroy(): Promise<void> {
    await this._initPromise; // TODO would actually be better to interrupt it if it's still going.
    assertDev(this.isInitialized());

    this.lookahead.destroy();

    for (const cb of this._onDestroyCallbacks) {
      cb();
    }

    // TODO make sure built-in nodes (like gain) are also garbage-collected (I think they should be).
  }

  private _reinitLookahead() {
    this.lookahead.destroy();
    const lookahead = this.lookahead = new Lookahead(this.element, this.settings);
    // Destruction is performed in `this.destroy` directly.
    lookahead.ensureInit();
  }
  private throttledReinitLookahead = throttle(this._reinitLookahead, 1000);

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
    this._setSpeed();
    const lookaheadSettingsChanged =
      oldSettings && (
        newSettings.volumeThreshold !== oldSettings.volumeThreshold
        || newSettings.marginBefore !== oldSettings.marginBefore
        || newSettings.marginAfter !== oldSettings.marginAfter
      )
    if (lookaheadSettingsChanged) {
      // TODO inefficient. Better to add an `updateSettings` method to `Lookahead`.
      this.throttledReinitLookahead();
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

  private _setSpeed() {
    // Don't need to `closestNonNormalSpeed` because currently `CloningController` doesn't switch speed between
    // silence and sounded, it performs a seek.
    const speedVal = this.settings.soundedSpeed;
    this.element.playbackRate = speedVal;

    // https://html.spec.whatwg.org/multipage/media.html#loading-the-media-resource:dom-media-defaultplaybackrate
    // The most common case where `load` is called is when the current source is replaced with an ad (or
    // the opposite, when the ad ends).
    // It's also a good practice.
    // https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource:dom-media-defaultplaybackrate-2
    this.element.defaultPlaybackRate = speedVal;
  }

  get telemetry(): TelemetryRecord {
    assertDev(this.isInitialized());

    // this._analyzerIn.getFloatTimeDomainData(this._volumeInfoBuffer);
    // const inputVolume = this._volumeInfoBuffer[this._volumeInfoBuffer.length - 1];

    // TODO that's a lot of 0s, can we do something about it?
    return {
      unixTime: Date.now() / 1000,
      // IntrinsicTime: this.element.currentTime,
      contextTime: 0,
      inputVolume: 0, // TODO
      lastActualPlaybackRateChange: {
        time: 0,
        value: 1,
        name: SpeedName.SOUNDED,
      },
      elementVolume: this._elementVolumeCache,
      totalOutputDelay: 0,
      delayFromInputToStretcherOutput: 0,
      stretcherDelay: 0,
      // TODO also log `interruptLastScheduledStretch` calls.
      // lastScheduledStretch: this._stretcherAndPitch.lastScheduledStretch,
      lastScheduledStretchInputTime: undefined,
    };
  }
}
