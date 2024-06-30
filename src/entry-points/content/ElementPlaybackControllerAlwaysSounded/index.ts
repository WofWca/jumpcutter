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

// Technically we can replace `audioContext.currentTime` with `performance.now() / 1000`.
import { audioContext } from '@/entry-points/content/audioContext';
import {
  isPlaybackActive,
} from '@/entry-points/content/helpers';
import { assertDev } from '@/helpers';
import type { MediaTime, AnyTime, AudioContextTime } from '@/helpers';
import type { Settings as ExtensionSettings } from '@/settings';
import { ControllerKind } from '@/settings';
import { SpeedName } from '@/helpers';
import type TimeSavedTracker from '@/entry-points/content/TimeSavedTracker';
import {
  setPlaybackRateAndRememberIt,
  setDefaultPlaybackRateAndRememberIt,
} from '../playbackRateChangeTracking';

type Time = AnyTime;

export type ControllerSettings =
  Pick<
    ExtensionSettings,
    'soundedSpeed'
  >;

export interface TelemetryRecord {
  clonePlaybackError?: never,
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
  delayFromInputToStretcherOutput: 0,
  elementVolume: number,
  totalOutputDelay: 0,
  lastScheduledStretchInputTime?: never,
  stretcherDelay: 0,
}

// TODO a lot of stuff is copy-pasted from ElementPlaybackControllerStretching.
/**
 * A controller that never switches to silenceSpeed (only makes the element play at soundedSpeed).
 * Basically a stub.
 */
export default class Controller {
  static controllerType = ControllerKind.ALWAYS_SOUNDED;

  // I'd be glad to make most of these `private` but this makes it harder to specify types in this file. TODO maybe I'm
  // just too bad at TypeScript.
  readonly element: HTMLMediaElement;
  settings: ControllerSettings;
  readonly initialized = true;

  public destroy!: () => void;
  private _destroyedPromise = new Promise<void>(r => this.destroy = r);
  _lastActualPlaybackRateChange: {
    time: AudioContextTime,
    value: number,
    name: SpeedName,
  } = {
    // Dummy values, will be ovewritten immediately in `_setSpeedAndLog`.
    name: SpeedName.SOUNDED,
    time: 0,
    value: 1,
  };

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

  init(): this {
    const element = this.element;

    const {
      playbackRate: elementPlaybackRateBeforeInitialization,
      defaultPlaybackRate: elementDefaultPlaybackRateBeforeInitialization,
    } = element;
    this._destroyedPromise.then(() => {
      setPlaybackRateAndRememberIt(element, elementPlaybackRateBeforeInitialization);
      setDefaultPlaybackRateAndRememberIt(element, elementDefaultPlaybackRateBeforeInitialization);
    });

    this._setStateAccordingToNewSettings(this.settings);

    return this;
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
  private _setStateAccordingToNewSettings(newSettings: ControllerSettings) {
    this.settings = newSettings;

    // https://html.spec.whatwg.org/multipage/media.html#loading-the-media-resource:dom-media-defaultplaybackrate
    // The most common case where `load` is called is when the current source is replaced with an ad (or
    // the opposite, when the ad ends).
    // It's also a good practice.
    // https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource:dom-media-defaultplaybackrate-2
    setDefaultPlaybackRateAndRememberIt(
      this.element,
      this.settings.soundedSpeed,
    );

    this._setSpeedAndLog(SpeedName.SOUNDED);
  }

  /**
   * May return a new unitialized instance of its class, if particular settings are changed. The old one gets destroyed
   * and must not be used. The new instance will get initialized automatically and may not start initializing
   * immediately (waiting for the old one to get destroyed).
   * Can be called before the instance has been initialized.
   */
  updateSettingsAndMaybeCreateNewInstance(newSettings: ControllerSettings): Controller {
    // TODO how about not updating settings that heven't been changed
    this._setStateAccordingToNewSettings(newSettings);
    return this;
  }

  /**
   * @returns elementSpeedSwitchedAt
   */
  private _setSpeedAndLog(speedName: SpeedName.SOUNDED) {
    const speedVal = this.settings.soundedSpeed;
    setPlaybackRateAndRememberIt(this.element, speedVal);
    const elementSpeedSwitchedAt = audioContext.currentTime;

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
    // Avoiding creating new objects for performance.
    obj.time = elementSpeedSwitchedAt;
    obj.value = speedVal;
    obj.name = speedName;
    return elementSpeedSwitchedAt;
  }

  get telemetry(): TelemetryRecord {
    return {
      unixTime: Date.now() / 1000,
      // I heard accessing DOM is not very efficient, so maybe we could instead utilize `addPlaybackStopListener` and
      // 'ratechange' and infer `element.currentTime` from that?
      intrinsicTime: this.element.currentTime,
      elementPlaybackActive: isPlaybackActive(this.element),
      contextTime: audioContext.currentTime,
      inputVolume: 0,
      lastActualPlaybackRateChange: this._lastActualPlaybackRateChange,
      elementVolume: this.element.volume,
      totalOutputDelay: 0,
      delayFromInputToStretcherOutput: 0,
      stretcherDelay: 0,
    };
  }
}
