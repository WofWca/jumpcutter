/**
 * @license
 * Copyright (C) 2020, 2021, 2022, 2025  WofWca <wofwca@protonmail.com>
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

import {
  Settings, getSettings, setSettings, addOnStorageChangedListener, MyStorageChanges, ControllerKind,
  settingsChanges2NewValues, PerTabOverrides, defaultSettings,
} from '@/settings';
import { assertNever, assertDev } from '@/helpers';
import { isSourceCrossOrigin, requestIdleCallbackPolyfill } from '@/entry-points/content/helpers';
import requestIdlePromise from './helpers/requestIdlePromise';
import type ElementPlaybackControllerStretching from
  './ElementPlaybackControllerStretching/ElementPlaybackControllerStretching';
import type ElementPlaybackControllerCloning from './ElementPlaybackControllerCloning/ElementPlaybackControllerCloning';
import type ElementPlaybackControllerAlwaysSounded from './ElementPlaybackControllerAlwaysSounded';
import type TimeSavedTracker from './TimeSavedTracker';
import extensionSettings2ControllerSettings from './helpers/extensionSettings2ControllerSettings';
import broadcastStatus from './broadcastStatus';
import once from 'lodash/once';
import debounce from 'lodash/debounce';
import {
  mediaElementSourcesMap
} from '@/entry-points/content/getOrCreateMediaElementSourceAndUpdateMap';
import {
  lastPlaybackRateSetByThisExtensionMap, lastDefaultPlaybackRateSetByThisExtensionMap,
  setPlaybackRateAndRememberIt
} from './playbackRateChangeTracking';
import type executeNonSettingsActionsT from './nonSettingsUserActions';
import type { ContentStatusReason, RuntimeMessage } from '@/core/messaging/contracts';
import {
  decidePlaybackRatePolicy,
  pickBestMediaCandidateIndex,
  shouldForceSoundedSpeed,
  toMediaSelectionCandidate,
} from './helpers';

type SomeController =
  ElementPlaybackControllerStretching
  | ElementPlaybackControllerCloning
  | ElementPlaybackControllerAlwaysSounded;

export type TelemetryMessage =
  SomeController['telemetry']
  & {
    sessionTimeSaved: TimeSavedTracker['timeSavedData'],
    lifetimeTimeSaved: TimeSavedTracker['timeSavedData'],
    controllerType: ControllerKind,
    elementLikelyCorsRestricted: boolean,
    elementCurrentSrc?: string,
    createMediaElementSourceCalledForElement: boolean,
    /**
     * Remember that this could be `Infinity` for live streams,
     * and if `.duration` is otherwise unknown.
     */
    elementRemainingIntrinsicDuration: number,
  };

let allMediaElementsControllerActive = false;

type ControllerType<T extends ControllerKind> =
  T extends ControllerKind.STRETCHING ? typeof ElementPlaybackControllerStretching
  : T extends ControllerKind.CLONING ? typeof ElementPlaybackControllerCloning
  : T extends ControllerKind.ALWAYS_SOUNDED ? typeof ElementPlaybackControllerAlwaysSounded
  : never;

const controllerTypeDependsOnSettings = [
  'experimentalControllerType',
  'dontAttachToCrossOriginMedia',
] as const;
function getAppropriateControllerType(
  settings: Pick<Settings, typeof controllerTypeDependsOnSettings[number]>,
  elementSourceIsCrossOrigin: boolean,
): ControllerKind {
  // Analyzing audio data of a CORS-restricted media element is impossible because its
  // `MediaElementAudioSourceNode` outputs silence (see
  // https://webaudio.github.io/web-audio-api/#MediaElementAudioSourceOptions-security,
  // https://github.com/WofWca/jumpcutter/issues/47,
  // https://html.spec.whatwg.org/multipage/media.html#security-and-privacy-considerations),
  // so it's not that we only are unable to analyze it - the user also becomes unable to hear its sound.
  // The following is to avoid that.
  //
  // Actually, the fact that a source is cross-origin doesn't guarantee that `MediaElementAudioSourceNode`
  // will output silence. For example, if the media data is served with `Access-Control-Allow-Origin`
  // header set to `document.location.origin`. But currently it's not easy to detect that. See
  // https://github.com/WebAudio/web-audio-api/issues/2453.
  // It's better to not attach to an element than to risk muting it as it's more confusing to the user.
  return elementSourceIsCrossOrigin && settings.dontAttachToCrossOriginMedia
    ? ControllerKind.ALWAYS_SOUNDED
    : settings.experimentalControllerType
}

async function importAndCreateController<T extends ControllerKind>(
  kind: T,
  // Not just `constructorArgs` because e.g. settings can change while `import()` is ongoing.
  getConstructorArgs: () => ConstructorParameters<ControllerType<T>>
) {
  let Controller;
  switch (kind) {
    case ControllerKind.STRETCHING: {
      Controller = (await import(
        /* webpackExports: ['default'] */
        './ElementPlaybackControllerStretching/ElementPlaybackControllerStretching'
      )).default;
      break;
    }
    case ControllerKind.CLONING: {
      Controller = (await import(
        /* webpackExports: ['default'] */
        './ElementPlaybackControllerCloning/ElementPlaybackControllerCloning'
      )).default;
      break;
    }
    case ControllerKind.ALWAYS_SOUNDED: {
      Controller = (await import(
        /* webpackExports: ['default'] */
        './ElementPlaybackControllerAlwaysSounded'
      )).default;
      break;
    }
    default: assertNever(kind);
  }
  type Hack = ConstructorParameters<typeof ElementPlaybackControllerCloning>;
  const controller = new Controller(...(getConstructorArgs() as Hack));
  return controller;
}

function isElementIneligibleBecauseMuted(el: HTMLMediaElement, settings: Pick<Settings, 'omitMutedElements'>) {
  if (!settings.omitMutedElements) {
    return false;
  }
  if (el.muted) {
    return true;
  }
  // Check if element has no audio tracks (like slide videos in lecture recordings).
  // This helps with multi-video scenarios where one video has slides and another has audio.
  // The audioTracks API is not available in all browsers, so check safely.
  if ('audioTracks' in el) {
    const audioTracks = (el as HTMLMediaElement & { audioTracks?: { length: number } }).audioTracks;
    if (audioTracks && audioTracks.length === 0) {
      return true; // No audio tracks - likely a slides/silent video
    }
  }
  return false;
}

// type BasicSettings = Pick<Settings, 'omitMutedElements'>;
export default class AllMediaElementsController {
  activeMediaElement: HTMLMediaElement | undefined;
  activeMediaElementSourceIsCrossOrigin: boolean | undefined;
  unhandledNewElements = new Set<HTMLMediaElement>();
  handledElements = new WeakSet<HTMLMediaElement>();
  private handledMutedElements = new WeakSet<HTMLMediaElement>();
  // Track cleanup functions for each element to prevent memory leaks
  private elementCleanupFunctions = new WeakMap<HTMLMediaElement, () => void>();
  elementLastActivatedAt: number | undefined;
  controller: SomeController | undefined;

  // TODO refactor: rename this var? Since there are now 2 time saved trackers.
  // And other such variables.
  timeSavedTracker: TimeSavedTracker | undefined;
  private onSilenceSkippingSeek?: TimeSavedTracker['onSilenceSkippingSeek'];
  private getLifetimeTimeSaved?: () => TimeSavedTracker['timeSavedData']

  private settings: Settings | undefined;
  // Per-tab overrides that take precedence over global settings
  private perTabOverrides: PerTabOverrides | null = null;
  private statusReason: ContentStatusReason = 'initializing';
  private statusDetail: string | undefined;
  private stallGuardIntervalId: ReturnType<typeof setInterval> | undefined;
  private lastObservedRateChangeAtMs = Date.now();
  // This is so we don't have to load all the settings keys just for basic functionality.
  // This is pretty stupid. Maybe it could be soumehow refactored to look less stupid.
  private basicSettingsP: Promise<Pick<Settings, 'omitMutedElements'>>;
  private basicSettings: Awaited<typeof this.basicSettingsP> | undefined;
  private _resolveDestroyedPromise!: () => void;
  // Whatever is added to `_destroyedPromise.then` doesn't need to be added to `_onDetachFromActiveElement`,
  // it will be called in `destroy`.
  private _destroyedPromise = new Promise<void>(r => this._resolveDestroyedPromise = r);
  private _onDetachFromActiveElement?: () => void;

  constructor() {
    if (IS_DEV_MODE) {
      if (allMediaElementsControllerActive) {
        console.error("AllMediaElementsController is supposed to be a singletone, but it another was created while "
          + "one has not been destroyed");
      }
      allMediaElementsControllerActive = true;
    }

    this.basicSettingsP = getSettings('omitMutedElements').then(s => this.basicSettings = s);

    // Keep in mind that this listener is also responsible for the desturction of this instance in case
    // `enabled` gets changed to `false`.
    const reactToStorageChanges = (changes: MyStorageChanges) => {
      this.reactToSettingsNewValues(settingsChanges2NewValues(changes));
    }
    const removeListener = addOnStorageChangedListener(reactToStorageChanges);
    this._destroyedPromise.then(removeListener);

    // Listen for per-tab override messages from popup
    const perTabMessageListener = (message: RuntimeMessage) => {
      if (message?.type === 'perTabOverridesChanged') {
        this.setPerTabOverrides(message.overrides ?? null);
      }
    };
    chrome.runtime.onMessage.addListener(perTabMessageListener);
    this._destroyedPromise.then(() => chrome.runtime.onMessage.removeListener(perTabMessageListener));
  }

  /**
   * Apply per-tab overrides to the current settings.
   * These overrides take precedence over global settings.
   */
  public setPerTabOverrides(overrides: PerTabOverrides | null) {
    this.perTabOverrides = overrides;
    if (this.settings && overrides) {
      // Merge overrides with global settings and apply
      const mergedChanges: Partial<Settings> = {};
      if (overrides.enabled !== undefined) mergedChanges.enabled = overrides.enabled;
      if (overrides.soundedSpeed !== undefined) mergedChanges.soundedSpeed = overrides.soundedSpeed;
      if (overrides.silenceSpeedRaw !== undefined) mergedChanges.silenceSpeedRaw = overrides.silenceSpeedRaw;
      if (overrides.volumeThreshold !== undefined) mergedChanges.volumeThreshold = overrides.volumeThreshold;
      this.reactToSettingsNewValues(mergedChanges);
    } else if (this.settings && !overrides) {
      // Remove overrides - reload original settings
      getSettings(['enabled', 'soundedSpeed', 'silenceSpeedRaw', 'volumeThreshold']).then(originalSettings => {
        this.reactToSettingsNewValues(originalSettings);
      });
    }
    this.broadcastStatus();
  }
  private destroy() {
    this.detachFromActiveElement();
    clearInterval(this.stallGuardIntervalId);
    this.stallGuardIntervalId = undefined;
    this.statusReason = 'disabled';
    this.statusDetail = 'controller-destroyed';
    this.broadcastStatus();
    this._resolveDestroyedPromise();

    if (IS_DEV_MODE) {
      allMediaElementsControllerActive = false;
    }
  }
  private detachFromActiveElement() {
    // TODO It is possible to call this function before `this.controller` has been assigned.
    //
    // Also keep in mind that it's possible to never attached to any elements at all, even if `onNewMediaElements()`
    // has been called (see that function).
    this.controller?.destroy();
    this.controller = undefined;
    this.statusReason = 'no-active-media';
    this.statusDetail = undefined;
    this._onDetachFromActiveElement?.();
    this._onDetachFromActiveElement = undefined;
  }

  public broadcastStatus(): void {
    broadcastStatus({
      elementLastActivatedAt: this.elementLastActivatedAt,
      status: this.statusReason,
      detail: this.statusDetail,
    });
  }

  public getContentStatus() {
    return {
      elementLastActivatedAt: this.elementLastActivatedAt,
      status: this.statusReason,
      detail: this.statusDetail,
    } as const;
  }

  private async _loadSettings() {
    this.settings = await getSettings(defaultSettings);
    if (this.perTabOverrides) {
      Object.assign(this.settings, this.perTabOverrides);
    }
  }
  private ensureLoadSettings = once(this._loadSettings);
  private reactToSettingsNewValues(newValues: Partial<Settings>) {
    if (newValues.enabled === false) {
      this.destroy();
      return;
    }

    if (Object.keys(newValues).length === 0) return;

    if (this.basicSettings) {
      // This also saves keys other than `keyof typeof this.basicSettings`. Who asked tho?
      Object.assign(this.basicSettings, newValues);
    }

    if (!this.settings) {
      // The fact that the settings haven't yet been loaded means that nothing is initialized yet because
      // it couldn't have been initialized because nobody knows how to initialize it.
      // Might want to refactor this in the future.
      return;
    }
    Object.assign(this.settings, newValues);
    assertDev(this.controller);

    if (controllerTypeDependsOnSettings.some(key => key in newValues)) {
      const currentController = this.controller;
      const el = currentController.element;
      assertDev(typeof this.activeMediaElementSourceIsCrossOrigin === 'boolean');
      const newControllerType = getAppropriateControllerType(this.settings, this.activeMediaElementSourceIsCrossOrigin);
      if (newControllerType !== (currentController.constructor as any).controllerType) {
        const oldController = currentController;
        this.controller = undefined;
        (async () => {
          await oldController.destroy();
          assertDev(this.settings);
          const controller = this.controller = await importAndCreateController(
            newControllerType,
            () => [
              el,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              extensionSettings2ControllerSettings(this.settings!),
              (...args) => this.onSilenceSkippingSeek?.(...args),
            ]
          );
          controller.init();
          // Controller destruction is done in `detachFromActiveElement`.
        })();
      }
    } else {
      // See the `updateSettingsAndMaybeCreateNewInstance` method - `this.controller` may be uninitialized after that.
      // TODO maybe it would be more clear to explicitly reinstantiate it in this file, rather than in that method?
      this.controller = this.controller.updateSettingsAndMaybeCreateNewInstance(
        extensionSettings2ControllerSettings(this.settings) // TODO creating a new object on each settings change? SMH.
      );
      // Controller destruction is done in `detachFromActiveElement`.
    }
  }

  private onConnect = (port: chrome.runtime.Port) => {
    let executeNonSettingsActions: undefined | typeof executeNonSettingsActionsT

    let listener: (msg: unknown) => void;
    switch (port.name) {
      case 'telemetry': {
        let shouldRespondToNextRequest = true;
        const setShouldRespondToNextRequestToTrue =
          () => shouldRespondToNextRequest = true;
        listener = (msg: unknown) => {
          if (IS_DEV_MODE) {
            if (msg !== 'getTelemetry') {
              throw new Error('Unsupported message type')
            }
          }

          if (!shouldRespondToNextRequest) {
            // This is most usable for the initial page load where the listener
            // would queue up a lot of messages and they would all fire
            // almost at the same time.
            //
            // Actually, measuring time it takes to execute this function,
            // It's below 1 ms (yep) 90% of the time, but it might affect
            // performance indirectly, loading up GC and IPC.
            //
            // Would be ideal if the popup didn't send the messages
            // at all if we didn't respond for a while. I tried to do that,
            // but it's a bit of a headache to do this
            // without degrading performance.
            // Perhaps let's just wait until we get around to switching
            // to "subscription"-based telemetry.
            return;
          }
          shouldRespondToNextRequest = false;
          // Whichever is faster
          requestIdleCallbackPolyfill(setShouldRespondToNextRequestToTrue);
          setTimeout(setShouldRespondToNextRequestToTrue, 200);

          if (
            !this.controller?.initialized
            || !this.timeSavedTracker
            || !this.getLifetimeTimeSaved
          ) {
            return;
          }
          assertDev(typeof this.activeMediaElementSourceIsCrossOrigin === 'boolean');
          assertDev(this.activeMediaElement);
          const elementLikelyCorsRestricted = this.activeMediaElementSourceIsCrossOrigin;
          const telemetryMessage: TelemetryMessage = {
            ...this.controller.telemetry,
            sessionTimeSaved: this.timeSavedTracker.timeSavedData,
            lifetimeTimeSaved: this.getLifetimeTimeSaved(),
            controllerType: (this.controller.constructor as any).controllerType,
            elementLikelyCorsRestricted,
            // `undefined` for performance.
            elementCurrentSrc: elementLikelyCorsRestricted ? this.activeMediaElement.currentSrc : undefined,
            // TODO check if the map lookup is too slow to do it several times per second.
            createMediaElementSourceCalledForElement: !!mediaElementSourcesMap.get(this.activeMediaElement),
            elementRemainingIntrinsicDuration: this.activeMediaElement.duration - this.activeMediaElement.currentTime,
          };
          port.postMessage(telemetryMessage);
        };
        break;
      }
      case 'nonSettingsActions': {
        listener = async (msg: unknown) => {
          if (this.activeMediaElement == undefined) {
            return
          }
          if (executeNonSettingsActions == undefined) {
            executeNonSettingsActions = (await import(
              /* webpackExports: ['default'] */
              './nonSettingsUserActions'
            )).default
          }
          executeNonSettingsActions(this.activeMediaElement, msg as Parameters<typeof executeNonSettingsActions>[1]);
        };
        break;
      }
      default: {
        // port.disconnect()
        if (IS_DEV_MODE) {
          if (port.name !== 'timeSavedBadgeText') {
            throw new Error(`Unrecognized port name "${port.name}"`);
          }
        }
        return;
      }
    }
    port.onMessage.addListener(listener);
    this._destroyedPromise.then(() => port.onMessage.removeListener(listener));
  }
  private _addOnConnectListener() {
    chrome.runtime.onConnect.addListener(this.onConnect);
    this._destroyedPromise.then(() => chrome.runtime.onConnect.removeListener(this.onConnect));
  }
  private ensureAddOnConnectListener = once(this._addOnConnectListener);

  private async _initHotkeyListener() {
    assertDev(this.settings)
    const initHotkeyListener = (await import(
      /* webpackExports: ['default'] */
      './hotkeys'
    )).default;
    await initHotkeyListener({
      getSettings: () => this.settings!,
      setSettings: (newSettings) => {
        // TODO but this will cause `reactToSettingsNewValues` to get called twice – immediately and on storage change.
        // Nothing critical, but not great for performance.
        // How about we only update the`settings` object synchronously (so sequential changes can be made, as
        // `keydownEventToActions` depends on it), but do not take any action until the onChanged event fires?
        // Better yet, rewrite settings changes with messages API already so the script that made the change doesn't
        // have to react to its own settings changes because it doesn't receive its own settings update message.
        this.reactToSettingsNewValues(newSettings);
        setSettings(newSettings);
      },
      getActiveMediaElement: () => this.activeMediaElement,
      onStop: (callback) => this._destroyedPromise.then(callback),
    })
  }
  private ensureInitHotkeyListener = once(this._initHotkeyListener);

  private async ensureAttachToElement(el: HTMLMediaElement) {
    if (IS_DEV_MODE) {
      if (el.readyState < HTMLMediaElement.HAVE_METADATA) {
        // We shouldn't be doing that because this probably means that the element has no source or is still loading
        // so it doesn't make sense to assess whether it's CORS-restricted or whether we can use the cloning
        // algorithm.
        // TODO fix: I think this can happen when the video is muted initially and you unmute
        // it while it's still not loaded.
        console.warn('Attaching to an element with `el.readyState < HTMLMediaElement.HAVE_METADATA`');
      }
    }

    const calledAt = Date.now();
    if (this.activeMediaElement === el) {
      // Need to do this even if it's already the active element, for the case when there are multiple iframe-embedded
      // media elements on the page.
      this.elementLastActivatedAt = calledAt;
      this.statusReason = 'active';
      this.statusDetail = undefined;
      return;
    }
    if (this.activeMediaElement) {
      this.detachFromActiveElement();
    }
    this.activeMediaElement = el;
    this.statusReason = 'initializing';
    this.statusDetail = 'attaching-controller';
    this.broadcastStatus();

    assertDev(this._onDetachFromActiveElement === undefined, 'I think `_onDetachFromActiveElement` '
      + `should be \`undefined\` here. Instead it is ${this._onDetachFromActiveElement}`);
    const onDetachCallbacks: Array<() => void> = []
    let onDetach = (callback: () => void) => {
      onDetachCallbacks.push(callback)
    }
    this._onDetachFromActiveElement = () => {
      onDetachCallbacks.forEach(cb => cb());
      this._onDetachFromActiveElement = undefined

      // We have been ordered to detach from the element.
      // From now on just invoke the cleanup callbacks immediately.
      onDetach = (callback) => callback()
    }

    // Currently this is technically not required since `this.activeMediaElement` is immediately reassigned
    // in the line above after the `detachFromActiveElement` call.
    onDetach(() => this.activeMediaElement = undefined);

    await this.ensureLoadSettings();
    assertDev(this.settings)

    // Skip live streams (duration is Infinity) if the setting is enabled.
    // Live streams don't work well with silence-skipping because they have no defined duration.
    if (this.settings.autoDisableForLiveStreams && !Number.isFinite(el.duration)) {
      if (IS_DEV_MODE) {
        console.log('Jump Cutter: Skipping live stream (duration is Infinity)');
      }
      this.activeMediaElement = undefined;
      this.statusReason = 'unsupported-media';
      this.statusDetail = 'live-stream-auto-disabled';
      this.broadcastStatus();
      return;
    }

    const elCrossOrigin = this.activeMediaElementSourceIsCrossOrigin = isSourceCrossOrigin(el);
    const onMaybeSourceChange = () => {
      this.activeMediaElementSourceIsCrossOrigin = isSourceCrossOrigin(el);
      // TODO perhaps we also need to re-run the controller selection code (which is inside
      // `reactToSettingsNewValues` right now)? But what if `createMediaElementSource` has already been
      // called? There isn't really a point in switching to the `ALWAYS_SOUNDED` controller in that case,
      // is there?
    };
    // I believe 'loadstart' might get emited even if the source didn't change (e.g. `el.load()`
    // has been called manually), but you pretty much can't change source and begin its playback
    // without firing the 'loadstart' event.
    // So this is reliable.
    el.addEventListener('loadstart', onMaybeSourceChange, { passive: true });
    onDetach(() => el.removeEventListener('loadstart', onMaybeSourceChange));

    const controllerP = importAndCreateController(
      getAppropriateControllerType(this.settings, elCrossOrigin),
      () => [
        el,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        extensionSettings2ControllerSettings(this.settings!),
        (...args) => this.onSilenceSkippingSeek?.(...args),
      ]
    ).then(async controller => {
      this.controller = controller;
      await controller.init();
      // Controller destruction is done in `detachFromActiveElement`.
      return controller;
    });

    let hotkeyListenerP;
    if (this.settings.enableHotkeys) {
      hotkeyListenerP = this.ensureInitHotkeyListener();
    }

    let onSilenceSkippingSeek1: typeof this.onSilenceSkippingSeek
    let onSilenceSkippingSeek2: typeof this.onSilenceSkippingSeek
    this.onSilenceSkippingSeek = (...args) => {
      onSilenceSkippingSeek1?.(...args)
      onSilenceSkippingSeek2?.(...args)
    }
    onDetach(() => this.onSilenceSkippingSeek = undefined);

    const TimeSavedTrackerPromise = import(
      /* webpackExports: ['default'] */
      './TimeSavedTracker'
    );
    // TODO an option to disable it.
    const timeSavedTrackerPromise = (async () => {
      const TimeSavedTracker = (await TimeSavedTrackerPromise).default
      await controllerP; // It doesn't make sense to measure its effectiveness if it hasn't actually started working yet.
      const timeSavedTracker = this.timeSavedTracker = new TimeSavedTracker(
        el,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.settings!,
        addOnStorageChangedListener,
      );
      onDetach(() => timeSavedTracker.destroy());

      onSilenceSkippingSeek1 =
        timeSavedTracker.onSilenceSkippingSeek.bind(timeSavedTracker);

      return timeSavedTracker
    })();

    // TODO an option to disable it.
    const trackLifetimeTimeSaved = true
    if (trackLifetimeTimeSaved) {
      const importP = import(
        /* webpackExports: ['default'] */
        './lifetimeTimeSaved'
      );
      (async () => {
        const startTrackingLifetimeTimeSaved = (await importP).default
        const TimeSavedTracker = (await TimeSavedTrackerPromise).default
        await controllerP; // Same as above
        // Note that this will delay all telemetry.
        await requestIdlePromise({ timeout: 10_000 })

        const {
          getLifetimeTimeSaved,
          onSilenceSkippingSeek
        } = startTrackingLifetimeTimeSaved(
          el,
          this.settings!,
          (newSettingsValues) => {
            setSettings(newSettingsValues);

            // We could have called `this.reactToSettingsNewValues` instead,
            // but let's not do that for performance,
            // because it's not interested in the changes
            // to these "time saved" values.
            Object.assign(this.settings!, newSettingsValues);
          },
          TimeSavedTracker,
          onDetach,
        )
        onSilenceSkippingSeek2 = onSilenceSkippingSeek

        this.getLifetimeTimeSaved = getLifetimeTimeSaved
        onDetach(() => {
          if (this.getLifetimeTimeSaved !== getLifetimeTimeSaved) {
            // Note that this is not the only place that would be affected
            // by such a race condition.
            IS_DEV_MODE &&
              console.warn(
                "Race condition: this.getLifetimeTimeSaved !== getLifetimeTimeSaved",
                this.getLifetimeTimeSaved,
                getLifetimeTimeSaved,
                "maybe we tried to attach to an element before detaching from the previous one"
              );

            return;
          }
          this.getLifetimeTimeSaved = undefined;
        });
      })();
    }

    {
      // TODO perf: dynamically import this.
      // Listen to playback rate changes and maybe update `settings.soundedSpeed` or prevent the
      // change, depending on settings.
      // I think that this should only apply to elements whose playbackRate this extension is controlling.
      // Which it is now.

      // Keep in mind that several events may be fired in the same event cycle. And, for example,
      // if you do `el.playbackRate = 2; el.playbackRate = 3;`, two events will fire, but `el.playbackRate`
      // will be `3`.
      // Also keep in mind that changing `defaultPlaybackRate` also fires the 'ratechange' event.

      // Also keep in mind that when media element load algorithm is executed, it does
      // `el.playbackRate = el.defaultPlaybackRate`.
      // https://html.spec.whatwg.org/multipage/media.html#media-element-load-algorithm

      // Video Speed Controller extension does this too, but that code is not really of use to us
      // because we also switch to silenceSpeed, in which case we must not update soundedSpeed.
      // https://github.com/igrigorik/videospeed/blob/caacb45d614db312cf565e5f92e09a14e52ccf62/inject.js#L467-L493

      // Ensure that the values for this element exist in the map. Currently they should already be
      // there, but let's super-ensure it.
      // Semantically it says "we approve the current values".
      lastPlaybackRateSetByThisExtensionMap.set(el, el.playbackRate);
      lastDefaultPlaybackRateSetByThisExtensionMap.set(el, el.defaultPlaybackRate);

      // A quick and dirty fix for Twitch (https://github.com/WofWca/jumpcutter/issues/25).
      // TODO improvement: https://github.com/WofWca/jumpcutter/issues/101.
      // So people don't have to go to settings.
      const forcePrevent = (
        // Check if the setting has the default value (so the user didn't change it, otherwise
        // they probably want different behavior).
        [undefined, 'updateSoundedSpeed'].includes(
          this.settings!.onPlaybackRateChangeFromOtherScripts
        )
        // So people have a way of tirning this off.
        // @ts-expect-error 2339
        && !this.settings.dontForcePreventPlaybackRateChangesOnTwitch
        && ['www.twitch.tv', 'twitch.tv'].includes(document.location.host)
        // 2050-01-01. In case I get hit by a bus.
        && Date.now() < 2524608000000
      );

      const ratechangeListener = (event: Event) => {
        const el_ = event.target as HTMLMediaElement;
        this.lastObservedRateChangeAtMs = Date.now();

        if (IS_DEV_MODE) {
          if (lastPlaybackRateSetByThisExtensionMap.get(el_) === undefined) {
            console.warn('Expected playbackRate to have been set by us at least once');
          }
          if (lastDefaultPlaybackRateSetByThisExtensionMap.get(el_) === undefined) {
            console.warn('Expected defaultPlaybackRate to have been set by us at least once');
          }
        }

        const lastPlaybackRateSetByUs = lastPlaybackRateSetByThisExtensionMap.get(el_);
        const decision = decidePlaybackRatePolicy({
          mode: this.settings!.onPlaybackRateChangeFromOtherScripts,
          forcePrevent,
          currentPlaybackRate: el_.playbackRate,
          lastPlaybackRateSetByExtension: lastPlaybackRateSetByUs,
        });

        switch (decision) {
          case 'adopt-external-rate': {
            const settingsNewValues = { soundedSpeed: el_.playbackRate };
            this.reactToSettingsNewValues(settingsNewValues);
            setSettings(settingsNewValues);
            if (IS_DEV_MODE) {
              console.warn(
                'Updating soundedSpeed because playbackRate changed outside this extension.'
              );
            }
            break;
          }
          case 'prevent-change': {
            if (lastPlaybackRateSetByUs !== undefined) {
              setPlaybackRateAndRememberIt(el_, lastPlaybackRateSetByUs);
              event.stopImmediatePropagation();
            }
            break;
          }
          case 'ignore':
          default:
            break;
        }
      };
      const listenerOptions = {
        // Need `capture` so that this listener gets executed before all the other ones that other scripts
        // might have added (unless they as well do `capture: true`), so it can
        // `event.stopImmediatePropagation()`. Yes, it's only needed when
        // `onPlaybackRateChangeFromOtherScripts === 'prevent'`.
        capture: true,
        passive: true,
      }
      // TODO perf: we could be not attaching the listener at all if
      // `onPlaybackRateChangeFromOtherScripts === 'doNothing'`, and then attach it when
      // this gets changed.
      el.addEventListener('ratechange', ratechangeListener, listenerOptions);
      onDetach(
        () => el.removeEventListener('ratechange', ratechangeListener, listenerOptions)
      );
    }

    // TODO feat: don't require page reload for this settings change
    // to take effect.
    let sendingTimeSavedMessagesForBadgeP: undefined | Promise<void>
    if (this.settings.badgeWhatSettingToDisplayByDefault === 'timeSaved') {
      sendingTimeSavedMessagesForBadgeP = (async () => {
        const startSendingTimeSavedMessagesForBadge = (await import(
          /* webpackExports: ['startSendingTimeSavedMessagesForBadge'] */
          './badgeTimeSaved'
        )).startSendingTimeSavedMessagesForBadge;
        await requestIdlePromise({ timeout: 20_000 })

        await startSendingTimeSavedMessagesForBadge(
          el,
          this.settings!,
          addOnStorageChangedListener,
          timeSavedTrackerPromise,
          onDetach
        );
      })();
    }

    await controllerP;
    hotkeyListenerP && await hotkeyListenerP;
    await timeSavedTrackerPromise;
    sendingTimeSavedMessagesForBadgeP && await sendingTimeSavedMessagesForBadgeP

    this.ensureAddOnConnectListener();
    // Not doing this at the beginning of the function, beside `this.activeMediaElement = el;` because the popup
    // considers that `elementLastActivatedAt !== undefined` means that it's free to connect, but
    // `ensureAddOnConnectListener` can still have not been called. TODO refactor?
    this.elementLastActivatedAt = calledAt;
    this.statusReason = 'active';
    this.statusDetail = undefined;
    this.ensureStartStallGuard(el);
    this.broadcastStatus();
  }

  private ensureStartStallGuard(el: HTMLMediaElement) {
    clearInterval(this.stallGuardIntervalId);
    this.stallGuardIntervalId = setInterval(() => {
      if (!this.settings || this.activeMediaElement !== el || !this.controller) {
        return;
      }
      const shouldRecover = shouldForceSoundedSpeed({
        nowMs: Date.now(),
        lastRateChangeAtMs: this.lastObservedRateChangeAtMs,
        currentPlaybackRate: el.playbackRate,
        soundedSpeed: this.settings.soundedSpeed,
        elementPaused: el.paused,
        minimumStuckDurationMs: 3000,
      });
      if (!shouldRecover) {
        return;
      }
      setPlaybackRateAndRememberIt(el, this.settings.soundedSpeed);
      if (IS_DEV_MODE) {
        console.warn('Recovered from likely stuck playback state by forcing sounded speed');
      }
    }, 1500);
    this._destroyedPromise.then(() => {
      clearInterval(this.stallGuardIntervalId);
      this.stallGuardIntervalId = undefined;
    });
  }

  private ensureAttachToEventTargetElementIfEligible = async (e: Event) => {
    await this.basicSettingsP;
    assertDev(this.basicSettings);

    const el = e.target as HTMLMediaElement;
    if (!isElementIneligibleBecauseMuted(el, this.basicSettings)) {
      this.ensureAttachToElement(el);
    }
  }
  // private ensureAttachToEventTargetElementIfGotUnmutedAndIsPlayingAndOmitMutedIsTrue = async (e: Event) => {
  private onvolumechange = async (e: Event) => {
    const el = e.target as HTMLMediaElement;

    // I think the fact that the element was muted when we attached the 'volumechange' listener and the
    // listener got invoked doesn't necessarily mean that it's now not muted, because it may get
    // unmuted and then muted again in the same event loop cycle, so we need to check `el.muted`
    // in addition to `handledMutedElements.has(el)`.
    const gotUnmuted = this.handledMutedElements.has(el) && !el.muted;
    this.handledMutedElements.delete(el);

    if (gotUnmuted && !el.paused) {
      await this.basicSettingsP;
      assertDev(this.basicSettings);
      if (this.basicSettings.omitMutedElements) {
        this.ensureAttachToElement(el);
      }
    }
  }
  private handleNewElements(basicSettings: Exclude<typeof this.basicSettings, undefined>) {
    const newElements = this.unhandledNewElements;
    this.unhandledNewElements = new Set();

    for (const el of newElements) {
      if (this.handledElements.has(el)) {
        continue;
      }
      this.handledElements.add(el);

      // Make the active element the one that got started last.
      // Why not 'play'? See the comment about `el.readyState` below.
      el.addEventListener('playing', this.ensureAttachToEventTargetElementIfEligible, { passive: true });

      if (el.muted) {
        this.handledMutedElements.add(el);
      }
      el.addEventListener('volumechange', this.onvolumechange, { passive: true });

      // Store cleanup function for this element to prevent memory leaks when elements are removed
      const cleanup = () => {
        el.removeEventListener('playing', this.ensureAttachToEventTargetElementIfEligible);
        el.removeEventListener('volumechange', this.onvolumechange);
        this.handledElements.delete(el);
        this.handledMutedElements.delete(el);
      };
      this.elementCleanupFunctions.set(el, cleanup);
      this._destroyedPromise.then(cleanup);

      // TODO should we detach when it gets muted again? Maybe make a separate option for this?
      // Or should we maybe move this logic to the Controller?

      // TODO also react to settings changes, e.g. if `omitMutedElements` becomes false, attach to a muted one?
    }

    const eligibleForAttachmentElements: HTMLMediaElement[] = [];
    newElements.forEach(el => {
      if (!isElementIneligibleBecauseMuted(el, basicSettings)) {
        eligibleForAttachmentElements.push(el);
      }
    })

    const candidates = eligibleForAttachmentElements.filter(el =>
      el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA || !el.paused
    );
    const bestCandidateIndex = pickBestMediaCandidateIndex(
      candidates.map(toMediaSelectionCandidate)
    );
    if (bestCandidateIndex >= 0) {
      this.ensureAttachToElement(candidates[bestCandidateIndex]);
    } else if (!this.activeMediaElement) {
      this.statusReason = 'no-active-media';
      this.statusDetail = undefined;
      this.broadcastStatus();
    }
    // Otherwise it seems that the only benefit of attaching to some other element is that it can be started with a
    // pause/unpause hotkey.
  }
  private debouncedHandleNewElements = debounce(this.handleNewElements, 0, { maxWait: 3000 });
  /**
   * Calling with the same element multiple times is fine, calling multiple times on the same tick is fine.
   * Order in which elements are passed in fact matters, but in practice not very much.
   */
  public onNewMediaElements(...newElements: HTMLMediaElement[]): void {
    newElements.forEach(el => this.unhandledNewElements.add(el));
    // TODO actually we don't currently have to await for `this.basicSettingsP` if the element is not muted,
    // so something like `isPotentiallyIneligibleForAttachment` would do in that case. It would probably
    // unreasonably complicate the code a lot though.
    this.basicSettingsP.then(() => {
      assertDev(this.basicSettings);
      this.debouncedHandleNewElements(this.basicSettings);
    })
  }

  /**
   * Clean up event listeners when media elements are removed from the DOM.
   * This prevents memory leaks that can occur when navigating between videos.
   */
  public onRemovedMediaElements(...removedElements: HTMLMediaElement[]): void {
    for (const el of removedElements) {
      const cleanup = this.elementCleanupFunctions.get(el);
      if (cleanup) {
        cleanup();
        this.elementCleanupFunctions.delete(el);
      }
      // Also remove from unhandled elements set if present
      this.unhandledNewElements.delete(el);
      // If this was the active element, detach from it
      if (this.activeMediaElement === el) {
        this.detachFromActiveElement();
      }
    }
  }
}
