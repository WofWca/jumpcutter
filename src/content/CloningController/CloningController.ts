import Lookahead from './Lookahead';
import type { Time } from '@/helpers';
import type { Settings as ExtensionSettings } from '@/settings';
import { assertDev, SpeedName } from '@/helpers';
import throttle from 'lodash/throttle';

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

  constructor(element: HTMLMediaElement, controllerSettings: ControllerSettings) {
    this.element = element;
    this.settings = controllerSettings;

    const lookahead = this.lookahead = new Lookahead(element, this.settings);
    // Destruction is performed in `this.destroy` directly.
    lookahead.ensureInit();
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
    element.addEventListener('volumechange', onElementVolumeChange);
    this._onDestroyCallbacks.push(() => element.removeEventListener('volumechange', onElementVolumeChange));

    const { lookahead } = this;
    // TODO Super inefficient, I know.
    const onTimeupdate = () => {
      const { currentTime } = element;
      const seekTo = this.lookahead.getNextSoundedTime(currentTime);
      // Be careful, when you seek the new `currentTime` can be a bit lower (or bigger) than the value that you
      // assigned to it, so `seekTo !== currentTime` will not work.
      // The threshold value I chose is somewhat arbitrary, based on human perception, seeking duration and
      // abovementioned seeking time error.
      // Based on a bit of testing, it appears that it usually takes 20-200ms to perform
      // a precise seek (`.currentTime = ...`). Keep in mind that it's real time, not media-intrinsic time,
      // so the bigger `soundedSpeed` is, the less reasonable it gets to perform a seek. TODO calculate intrinsic time?
      // Or just use `fastSeek`?
      const farEnoughToPerformSeek = seekTo > currentTime + 0.15;
      if (farEnoughToPerformSeek) {
        element.currentTime = seekTo;

        // It's very rough and I think it can skip the start of a sounded part. Also not supported in Chromium.
        // Also see the comment about seeking error above. TODO?
        // element.fastSeek(seekTo);
      }
    }
    await lookahead.ensureInit().then(() => {
      element.addEventListener('timeupdate', onTimeupdate);
      this._onDestroyCallbacks.push(() => element.removeEventListener('timeupdate', onTimeupdate));
    });

    this.initialized = true;
    this._resolveInitPromise(this);

    Object.assign(this.settings, this._pendingSettingsUpdates);
    this._setStateAccordingToNewSettings(this.settings, null);
    delete this._pendingSettingsUpdates;
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
