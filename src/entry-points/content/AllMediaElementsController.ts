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

import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';
import {
  Settings, getSettings, setSettings, addOnStorageChangedListener, MyStorageChanges, ControllerKind,
  settingsChanges2NewValues,
} from '@/settings';
import { clamp, assertNever, assertDev } from '@/helpers';
import { isSourceCrossOrigin, requestIdleCallbackPolyfill } from '@/entry-points/content/helpers';
import type ElementPlaybackControllerStretching from
  './ElementPlaybackControllerStretching/ElementPlaybackControllerStretching';
import type ElementPlaybackControllerCloning from './ElementPlaybackControllerCloning/ElementPlaybackControllerCloning';
import type ElementPlaybackControllerAlwaysSounded from './ElementPlaybackControllerAlwaysSounded';
import type TimeSavedTracker from './TimeSavedTracker';
import extensionSettings2ControllerSettings from './helpers/extensionSettings2ControllerSettings';
import { HotkeyAction, HotkeyBinding } from '@/hotkeys';
import type { keydownEventToActions } from '@/hotkeys';
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

type SomeController =
  ElementPlaybackControllerStretching
  | ElementPlaybackControllerCloning
  | ElementPlaybackControllerAlwaysSounded;

export type TelemetryMessage =
  SomeController['telemetry']
  & {
    sessionTimeSaved: TimeSavedTracker['timeSavedData'],
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

function executeNonSettingsActions(
  el: HTMLMediaElement,
  nonSettingsActions: Exclude<ReturnType<typeof keydownEventToActions>, undefined>[1]
) {
  for (const action of nonSettingsActions) {
    switch (action.action) {
      case HotkeyAction.REWIND: el.currentTime -= (action as HotkeyBinding<HotkeyAction.REWIND>).actionArgument; break;
      case HotkeyAction.ADVANCE: el.currentTime += (action as HotkeyBinding<HotkeyAction.ADVANCE>).actionArgument; break;
      case HotkeyAction.TOGGLE_PAUSE: el.paused ? el.play() : el.pause(); break;
      case HotkeyAction.TOGGLE_MUTE: el.muted = !el.muted; break;
      case HotkeyAction.INCREASE_VOLUME:
      case HotkeyAction.DECREASE_VOLUME: {
        const unitVector = action.action === HotkeyAction.INCREASE_VOLUME ? 1 : -1;
        const toAdd = unitVector * (action as HotkeyBinding<HotkeyAction.INCREASE_VOLUME>).actionArgument / 100;
        el.volume = clamp(el.volume + toAdd, 0, 1);
        break;
      }
      default: assertNever(action.action);
    }
  }
}

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
  return settings.omitMutedElements
    ? el.muted
    : false;
}

// type BasicSettings = Pick<Settings, 'omitMutedElements'>;
export default class AllMediaElementsController {
  activeMediaElement: HTMLMediaElement | undefined;
  activeMediaElementSourceIsCrossOrigin: boolean | undefined;
  unhandledNewElements = new Set<HTMLMediaElement>();
  handledElements = new WeakSet<HTMLMediaElement>();
  private handledMutedElements = new WeakSet<HTMLMediaElement>();
  elementLastActivatedAt: number | undefined;
  controller: SomeController | undefined;
  timeSavedTracker: TimeSavedTracker | undefined;
  private settings: Settings | undefined;
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
  }
  private destroy() {
    this.detachFromActiveElement();
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
    this._onDetachFromActiveElement?.();
    this._onDetachFromActiveElement = undefined;
  }

  public broadcastStatus(): void {
    broadcastStatus({ elementLastActivatedAt: this.elementLastActivatedAt });
  }

  private async _loadSettings() {
    this.settings = await getSettings();
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
              (...args) => this.timeSavedTracker?.onSilenceSkippingSeek(...args),
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

  private onConnect = (port: browser.runtime.Port | chrome.runtime.Port) => {
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

          if (!this.controller?.initialized || !this.timeSavedTracker) {
            return;
          }
          assertDev(typeof this.activeMediaElementSourceIsCrossOrigin === 'boolean');
          assertDev(this.activeMediaElement);
          const elementLikelyCorsRestricted = this.activeMediaElementSourceIsCrossOrigin;
          const telemetryMessage: TelemetryMessage = {
            ...this.controller.telemetry,
            sessionTimeSaved: this.timeSavedTracker.timeSavedData,
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
        listener = (msg: unknown) => {
          if (this.activeMediaElement) {
            executeNonSettingsActions(this.activeMediaElement, msg as Parameters<typeof executeNonSettingsActions>[1]);
          }
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
    browserOrChrome.runtime.onConnect.addListener(this.onConnect);
    this._destroyedPromise.then(() => browserOrChrome.runtime.onConnect.removeListener(this.onConnect));
  }
  private ensureAddOnConnectListener = once(this._addOnConnectListener);

  private async _initHotkeyListener() {
    const hotkeysModule = await import(
      /* webpackExports: ['keydownEventToActions', 'eventTargetIsInput'] */
      '@/hotkeys'
    );
    const keydownEventToActions = hotkeysModule.keydownEventToActions;
    const eventTargetIsInput = hotkeysModule.eventTargetIsInput;
    // TODO how about put this into './hotkeys.ts' in the form of a curried function that takes arguments that look
    // something like `getSettings: () => Settings`?
    const handleKeydown = (e: KeyboardEvent) => {
      if (eventTargetIsInput(e)) return;
      assertDev(this.settings);
      const actions = keydownEventToActions(e, this.settings);
      if (!actions) {
        return;
      }
      const [ settingsNewValues, nonSettingsActions, overrideWebsiteHotkeys ] = actions;

      // Works because `useCapture` of `addEventListener` is `true`. However, it's not guaranteed to work on every
      // website, as they might as well set `useCapture` to `true`. TODO fix. Somehow. Maybe attach it before
      // website's listeners get attached, by adding a `"run_at": "document_start"` content script.
      // https://github.com/igrigorik/videospeed/blob/56eb7a08459d6746a0019b0b0c4edf974c022114/inject.js#L592-L596
      if (overrideWebsiteHotkeys) {
        e.preventDefault();
        e.stopPropagation();
      }

      // TODO but this will cause `reactToSettingsNewValues` to get called twice – immediately and on storage change.
      // Nothing critical, but not great for performance.
      // How about we only update the`settings` object synchronously (so sequential changes can be made, as
      // `keydownEventToActions` depends on it), but do not take any action until the onChanged event fires?
      // Better yet, rewrite settings changes with messages API already so the script that made the change doesn't
      // have to react to its own settings changes because it doesn't receive its own settings update message.
      this.reactToSettingsNewValues(settingsNewValues);
      setSettings(settingsNewValues);

      executeNonSettingsActions(this.activeMediaElement!, nonSettingsActions);
    };
    // You might ask "Why don't you just use the native [commands API](https://developer.chrome.com/apps/commands)?"
    // And the answer is – you may be right. But here's a longer version:
    // * Our hotkeys are different from hotkeys you might have seen in videogames in the fact that ours are mostyly
    //   associated with an argument. Native hotkeys don't have this feature. We might have just strapped arguments to
    // native hotkeys on the options page, but it'd be a bit confusing.
    // * Docs say, "An extension can have many commands but only 4 suggested keys can be specified". Our extension has
    // quite a lot of hotkeys, each user would have to manually bind each of them.
    // * Native hotkeys are global to the browser, so it's quite nice when our hotkeys are only active when the
    // extension is enabled (with `enabled` setting) and is attached to a video.
    // * What gains are there? Would performance overhead be that much lower? Would it be lower at all?
    // * Keeps opportunities for more fine-grained control.
    // * Because I haven't considered it thorougly enough.
    //
    // Adding the listener to `document` instead of `video` because some websites (like YouTube) use custom players,
    // which wrap around a video element, which is not ever supposed to be in focus.
    assertDev(this.settings);
    // Why not always attach with `useCapture = true`? For performance.
    // TODO but if the user changed `overrideWebsiteHotkeys` for some binding, an extension reload will
    // be required. React to settings changes?
    if (this.settings.hotkeys.some(binding => binding.overrideWebsiteHotkeys)) {
      // `useCapture` is true because see `overrideWebsiteHotkeys`.
      document.addEventListener('keydown', handleKeydown, true);
      this._destroyedPromise.then(() => document.removeEventListener('keydown', handleKeydown, true));
    } else {
      // Deferred because it's not top priority. But maybe it should be?
      // Yes, it would mean that the `if (overrideWebsiteHotkeys) {` inside `handleKeydown` will always
      // be false.
      const handleKeydownDeferred =
        (...args: Parameters<typeof handleKeydown>) => setTimeout(handleKeydown, undefined, ...args);
      document.addEventListener('keydown', handleKeydownDeferred, { passive: true });
      this._destroyedPromise.then(() => document.removeEventListener('keydown', handleKeydownDeferred));
    }
    // this.hotkeyListenerAttached = true;
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
      return;
    }
    if (this.activeMediaElement) {
      this.detachFromActiveElement();
    }
    this.activeMediaElement = el;

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
        (...args) => this.timeSavedTracker?.onSilenceSkippingSeek(...args),
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

    // TODO an option to disable it.
    const timeSavedTrackerPromise = (async () => {
      const TimeSavedTracker = (await import(
        /* webpackExports: ['default'] */
        './TimeSavedTracker'
      )).default;
      await controllerP; // It doesn't make sense to measure its effectiveness if it hasn't actually started working yet.
      const timeSavedTracker = this.timeSavedTracker = new TimeSavedTracker(
        el,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.settings!,
        addOnStorageChangedListener,
      );
      onDetach(() => timeSavedTracker.destroy());

      return timeSavedTracker
    })();

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

        if (IS_DEV_MODE) {
          if (lastPlaybackRateSetByThisExtensionMap.get(el_) === undefined) {
            console.warn('Expected playbackRate to have been set by us at least once');
          }
          if (lastDefaultPlaybackRateSetByThisExtensionMap.get(el_) === undefined) {
            console.warn('Expected defaultPlaybackRate to have been set by us at least once');
          }
        }

        switch (
          !forcePrevent
            ? this.settings!.onPlaybackRateChangeFromOtherScripts
            : 'prevent'
        ) {
          case 'updateSoundedSpeed': {
            const lastPlaybackRateSetByUs = lastPlaybackRateSetByThisExtensionMap.get(el_);
            if (
              el_.playbackRate !== lastPlaybackRateSetByUs
              && lastPlaybackRateSetByUs !== undefined
            ) {
              // TODO improvement: hey, how about we watch `defaultPlaybackRate` instead of `playbackRate`?
              // While it may make more, sense, unfortunately it's rare that websites ever use `defaultPlaybackRate`.
              // Even YouTube doesn't update it. Make it an option at least? And should we maybe reach out to
              // these services / other extensions' developers to encourage them to update `defaultPlaybackRate`?

              // TODO improvement: how about we check if it's currently silence, therefore we should
              // be more careful with updating soundedSpeed, because some websites/extensions could
              // just be doing `el.playbackRate += increment`;

              const settingsNewValues = { soundedSpeed: el_.playbackRate };
              this.reactToSettingsNewValues(settingsNewValues);
              setSettings(settingsNewValues);
              if (IS_DEV_MODE) {
                console.warn('Updating soundedSpeed because apparently playbackRate was changed by'
                  + ' something other that this extension.');
              }
            }
            break;
          }
          case 'prevent': {
            // Consider doing this for `defaultPlaybackRate` as well.
            const lastPlaybackRateSetByUs = lastPlaybackRateSetByThisExtensionMap.get(el_);
            if (
              el_.playbackRate !== lastPlaybackRateSetByUs
              // Just in case.
              && lastPlaybackRateSetByUs !== undefined
            ) {
              setPlaybackRateAndRememberIt(el_, lastPlaybackRateSetByUs);
              // The website may be listening to 'ratechange' events and update `playbackRate`
              // inside the listener. Let's make it so that it doesn't receive the event.
              // This happens on Twitch (https://github.com/WofWca/jumpcutter/issues/25).
              event.stopImmediatePropagation();
            }
            break;
          }
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
      sendingTimeSavedMessagesForBadgeP = startSendingTimeSavedMessagesForBadge(
        el,
        timeSavedTrackerPromise,
        onDetach
      );
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
    this.broadcastStatus();
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
      this._destroyedPromise.then(() => el.removeEventListener('playing', this.ensureAttachToEventTargetElementIfEligible));

      if (el.muted) {
        this.handledMutedElements.add(el);
      }
      el.addEventListener('volumechange', this.onvolumechange, { passive: true });
      this._destroyedPromise.then(() => el.removeEventListener('volumechange', this.onvolumechange));

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

    // Attach to the first new element that is not paused, even if we're already attached to another.
    // The thoguht process is like this - if such an element has been inserted, it is most likely due to the user
    // wanting to switch his attention to it (e.g. pressing the "play" button on a custom media player, or scrolling
    // a page with an infinite scroll with autoplaying videos).
    // It may be that the designer of the website is an asshole and inserts new media elements whenever he feels like
    // it, or I missed some other common cases. TODO think about it.
    for (const el of eligibleForAttachmentElements) {
      if (!el.paused) {
        this.ensureAttachToElement(el);
        break;
      }
    }
    // Useful when the extension is disabled at first, then the user pauses the video to give himself time to enable it.
    if (!this.activeMediaElement) {
      for (const el of eligibleForAttachmentElements) {
        if (
          el.currentTime > 0
          // It is possilble for an element to have `currentTime > 0` while having its `readyState === HAVE_NOTHING`.
          // For example, this can happen if a website resumes playback from where the user stopped watching it on
          // another occasion (e.g. Odysee). Or with streams. This is mostly to ensure that we don't attach to
          // an element until its `currentSrc` is set to check if it cross-origin or not.
          // If this happens, we'll attach to it later, on a 'playing' event.
          // How about move this condition to `isElementIneligible` in order to also check it before
          // every other call to `ensureAttach`. Or make `ensureAttach` an async function
          // that awaits for the element to become ready. Don't forget to cancel the attachment
          // if it was called again with a new element.
          && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          this.ensureAttachToElement(el);
          break;
        }
      }
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
}

async function startSendingTimeSavedMessagesForBadge(
  el: HTMLMediaElement,
  timeSavedTrackerPromise: Promise<TimeSavedTracker>,
  onStop: (callback: () => void) => void,
) {
  let timeSavedPort_:
    undefined | ReturnType<typeof browserOrChrome.runtime.connect>
  const getTimeSavedPort = () => {
    if (timeSavedPort_ == undefined) {
      // TODO fix: this may connect to two destinations:
      // "local file player" if it's open
      // (when `.connect()` gets executed on another website),
      // and the background script.
      // In such a case in Chromium `onDisconnect` will not fire
      // when the background script gets unloaded,
      // as long as the local file player is open.
      // This results in the badge not getting updated.
      // See
      // - https://bugzilla.mozilla.org/show_bug.cgi?id=1465514
      // - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/Port#lifecycle
      // - https://developer.chrome.com/docs/extensions/develop/concepts/messaging#port-lifetime
      timeSavedPort_ = browserOrChrome.runtime.connect({
        name: 'timeSavedBadgeText'
      })

      // The port might get disconnected by the remote party,
      // i.e. the background script getting shut down.
      // In this case we'll want to open another port.
      timeSavedPort_.onDisconnect.addListener(() => {
        timeSavedPort_ = undefined
      })
    }
    return timeSavedPort_
  }
  onStop(() => {
    timeSavedPort_?.disconnect()
    timeSavedPort_ = undefined
  });

  let lastSentTimeSavedValue: undefined | string = undefined;

  const timeSavedTracker = await timeSavedTrackerPromise
  const maybeSendTimeSavedInfo = () => {
    const {
      wouldHaveLastedIfSpeedWasSounded,
      timeSavedComparedToSoundedSpeed
    } = timeSavedTracker.timeSavedData;
    // Time calculation from `getTimeSavedPlaybackRateEquivalents`.
    // TODO feat: an option to show speed compared to sounded speed,
    // and maybe percentage, or absolute value.
    const timeSaved = (
      wouldHaveLastedIfSpeedWasSounded /
      (wouldHaveLastedIfSpeedWasSounded - timeSavedComparedToSoundedSpeed)
    ).toFixed(2);

    if (lastSentTimeSavedValue !== timeSaved) {
      getTimeSavedPort().postMessage(timeSaved);
      lastSentTimeSavedValue = timeSaved;
    }

    el.removeEventListener('timeupdate', maybeSendTimeSavedInfo)
    attachListenerAfterIdle()
  }

  let idleCallbackCancelled = false
  onStop(() => (idleCallbackCancelled = true));
  const attachListener_ = () => {
    if (idleCallbackCancelled) {
      return
    }
    el.addEventListener('timeupdate', maybeSendTimeSavedInfo);
  }
  const attachListenerAfterIdle = () => {
    requestIdleCallbackPolyfill(attachListener_)
  }

  attachListenerAfterIdle()
  onStop(() => {
    el.removeEventListener('timeupdate', maybeSendTimeSavedInfo)
  });
  // Note that we don't remove the listener
  // when the setting value gets changed.
}
