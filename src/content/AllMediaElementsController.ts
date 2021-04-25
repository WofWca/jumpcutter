import browser from '@/webextensions-api';
import {
  Settings, getSettings, setSettings, addOnSettingsChangedListener, MyStorageChanges,
  removeOnSettingsChangedListener, settingsChanges2NewValues,
} from '@/settings';
import { clamp, assertNever, assertDev } from '@/helpers';
import type Controller from './Controller';
import type TimeSavedTracker from './TimeSavedTracker';
import extensionSettings2ControllerSettings from './extensionSettings2ControllerSettings';
import { HotkeyAction, HotkeyBinding } from '@/hotkeys';
import type { keydownEventToActions } from '@/hotkeys';
import broadcastStatus from './broadcastStatus';
import { oncePerInstance } from './helpers';
import debounce from 'lodash/debounce';

export type TelemetryMessage =
  ReturnType<Controller['getTelemetry']>
  & ReturnType<TimeSavedTracker['getTimeSavedData']>;

function executeNonSettingsActions(
  el: HTMLMediaElement,
  nonSettingsActions: ReturnType<typeof keydownEventToActions>['nonSettingsActions']
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

export default class AllMediaElementsController {
  activeMediaElement: HTMLMediaElement | undefined;
  unhandledNewElements = new Set<HTMLMediaElement>();
  handledElements = new WeakSet<HTMLMediaElement>();
  elementLastActivatedAt: number | undefined;
  controller: Controller | undefined;
  timeSavedTracker: TimeSavedTracker | undefined;
  private settings: Settings | undefined;
  private _onDestroyCallbacks: Array<() => void> = [];
  // Whatever is added to `_onDestroyCallbacks` doesn't need to be added to `_onDetachFromActiveElementCallbacks`, it
  // will be called in `destroy`.
  private _onDetachFromActiveElementCallbacks: Array<() => void> = [];

  constructor() {
    if (process.env.NODE_ENV !== 'production') {
      if (allMediaElementsControllerActive) {
        console.error("AllMediaElementsController is supposed to be a singletone, but it another was created while "
          + "one has not been destroyed");
      }
      allMediaElementsControllerActive = true;
    }
  }
  private destroy() {
    this.detachFromActiveElement();
    this._onDestroyCallbacks.forEach(cb => cb());

    if (process.env.NODE_ENV !== 'production') {
      allMediaElementsControllerActive = false;
    }
  }
  private detachFromActiveElement() {
    this._onDetachFromActiveElementCallbacks.forEach(cb => cb());
  }

  public broadcastStatus(): void {
    broadcastStatus({ elementLastActivatedAt: this.elementLastActivatedAt });
  }

  private oncePerInstance<T extends Parameters<typeof oncePerInstance>[1]>(f: T): T {
    return oncePerInstance(this, f);
  }

  private reactToSettingsNewValues(newValues: Partial<Settings>) {
    // Currently, this function is an event listener, and while it gets detached when the extension gets disabled, it
    // still gets executed on that change, because it gets detached within another event listener. This is to check if
    // this is the case.
    if (newValues.enabled === false) return;

    if (Object.keys(newValues).length === 0) return;

    assertDev(this.settings);
    Object.assign(this.settings, newValues);
    assertDev(this.controller);
    // See the `updateSettingsAndMaybeCreateNewInstance` method - `this.controller` may be uninitialized after that.
    // TODO maybe it would be more clear to explicitly reinstantiate it in this file, rather than in that method?
    this.controller = this.controller.updateSettingsAndMaybeCreateNewInstance(
      extensionSettings2ControllerSettings(this.settings) // TODO creating a new object on each settings change? SMH.
    );
  }
  private reactToSettingsChanges = (changes: MyStorageChanges) => {
    if (changes.enabled?.newValue === false) {
      this.destroy();
      return;
    }
    this.reactToSettingsNewValues(settingsChanges2NewValues(changes));
  }
  private _addOnSettingsChangedListener() {
    addOnSettingsChangedListener(this.reactToSettingsChanges);
    this._onDestroyCallbacks.push(() => removeOnSettingsChangedListener(this.reactToSettingsChanges));
  }
  private ensureAddOnSettingsChangedListener = this.oncePerInstance(this._addOnSettingsChangedListener);

  private onConnect = (port: browser.runtime.Port) => {
    let listener: (msg: unknown) => void;
    switch (port.name) {
      case 'telemetry': {
        listener = (msg: unknown) => {
          if (process.env.NODE_ENV !== 'production') {
            if (msg !== 'getTelemetry') {
              throw new Error('Unsupported message type')
            }
          }
          if (this.controller?.initialized && this.timeSavedTracker) {
            const telemetryMessage: TelemetryMessage = {
              ...this.controller.getTelemetry(),
              ...this.timeSavedTracker.getTimeSavedData(),
            };
            port.postMessage(telemetryMessage);
          }
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
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(`Unrecognized port name "${port.name}"`);
        }
        return;
      }
    }
    port.onMessage.addListener(listener);
    this._onDestroyCallbacks.push(() => port.onMessage.removeListener(listener));
  }
  private _addOnConnectListener() {
    browser.runtime.onConnect.addListener(this.onConnect);
    this._onDestroyCallbacks.push(() => browser.runtime.onConnect.removeListener(this.onConnect));
  }
  private ensureAddOnConnectListener = this.oncePerInstance(this._addOnConnectListener);

  private async _loadSettings() {
    this.settings = await getSettings();
  }
  private ensureLoadSettings = this.oncePerInstance(this._loadSettings);

  private async _initHotkeyListener() {
    const { keydownEventToActions, eventTargetIsInput } = await import(
      /* webpackExports: ['keydownEventToActions', 'eventTargetIsInput'] */
      '@/hotkeys'
    );
    // TODO how about put this into './hotkeys.ts' in the form of a curried function that takes arguments that look
    // something like `getSettings: () => Settings`?
    const handleKeydown = (e: KeyboardEvent) => {
      if (eventTargetIsInput(e)) return;
      assertDev(this.settings);
      const actions = keydownEventToActions(e, this.settings);
      const { settingsNewValues, nonSettingsActions, overrideWebsiteHotkeys } = actions;

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
    //
    // `useCapture` is true because see `overrideWebsiteHotkeys`.
    document.addEventListener('keydown', handleKeydown, true);
    this._onDestroyCallbacks.push(() => document.removeEventListener('keydown', handleKeydown, true));

    // this.hotkeyListenerAttached = true;
  }
  private ensureInitHotkeyListener = this.oncePerInstance(this._initHotkeyListener);

  private async esnureAttachToElement(el: HTMLMediaElement) {
    // Need to do this even if it's already the active element, for the case when there are multiple iframe-embedded
    // media elements on the page.
    this.elementLastActivatedAt = Date.now();

    if (this.activeMediaElement === el) {
      return;
    }
    if (this.activeMediaElement) {
      this.detachFromActiveElement();
    }
    this.activeMediaElement = el;
    // Currently this is technically not required since `this.activeMediaElement` is immediately reassigned
    // in the line above after the `detachFromActiveElement` call.
    this._onDetachFromActiveElementCallbacks.push(() => this.activeMediaElement = undefined);

    await this.ensureLoadSettings();
    this.ensureAddOnSettingsChangedListener();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const settings = this.settings!;

    const controllerP = (async () => {
      const { default: Controller } = await import(
        /* webpackExports: ['default'] */
        './Controller'
      );
      const controller = this.controller = new Controller(el, extensionSettings2ControllerSettings(settings));
      // TODO It is possible to call `detachFromActiveElement` before the `_onDetachFromActiveElementCallbacks` array
      // has been filled. Same for `destroy`.
      this._onDetachFromActiveElementCallbacks.push(() => controller.destroy());

      await this.controller.init();
    })();

    let hotkeyListenerP;
    if (settings.enableHotkeys) {
      hotkeyListenerP = this.ensureInitHotkeyListener();
    }

    // TODO an option to disable it.
    const timeSavedTrackerPromise = (async () => {
      const { default: TimeSavedTracker } = await import(
        /* webpackExports: ['default'] */
        './TimeSavedTracker'
      );
      await controllerP; // It doesn't make sense to measure its effectiveness if it hasn't actually started working yet.
      const timeSavedTracker = this.timeSavedTracker = new TimeSavedTracker(
        el,
        settings,
        addOnSettingsChangedListener,
        removeOnSettingsChangedListener,
      );
      this._onDetachFromActiveElementCallbacks.push(() => timeSavedTracker.destroy());
    })();

    await controllerP;
    hotkeyListenerP && await hotkeyListenerP;
    await timeSavedTrackerPromise;

    this.ensureAddOnConnectListener();
    this.broadcastStatus();
  }

  private onMediaPlayEvent = (e: Event) => {
    this.esnureAttachToElement(e.target as HTMLMediaElement);
  }
  private handleNewElements() {
    const newElements = this.unhandledNewElements;
    this.unhandledNewElements = new Set();

    for (const el of newElements) {
      if (this.handledElements.has(el)) {
        continue;
      }
      this.handledElements.add(el);

      el.addEventListener('play', this.onMediaPlayEvent);
      this._onDestroyCallbacks.push(() => el.removeEventListener('play', this.onMediaPlayEvent));
    }

    // Attach to the first new element that is not paused, even if we're already attached to another.
    // The thoguht process is like this - if such an element has been inserted, it is most likely due to the user
    // wanting to switch his attention to it (e.g. pressing the "play" button on a custom media player, or scrolling
    // a page with an infinite scroll with autoplaying videos).
    // It may be that the designer of the website is an asshole and inserts new media elements whenever he feels like
    // it, or I missed some other common cases. TODO think about it.
    for (const el of newElements) {
      if (!el.paused) {
        this.esnureAttachToElement(el);
        break;
      }
    }
    // Useful when the extension is disabled at first, then the user pauses the video to give himself time to enable it.
    if (!this.activeMediaElement) {
      for (const el of newElements) {
        if (el.currentTime > 0) {
          this.esnureAttachToElement(el);
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
    this.debouncedHandleNewElements();
  }
}
