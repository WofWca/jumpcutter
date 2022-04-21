import browser from '@/webextensions-api';
import {
  Settings, getSettings, setSettings, addOnStorageChangedListener, MyStorageChanges, ControllerKind,
  removeOnStorageChangedListener, settingsChanges2NewValues,
} from '@/settings';
import { clamp, assertNever, assertDev } from '@/helpers';
import { isSourceCrossOrigin } from '@/content/helpers';
import type StretchingController from './StretchingController/StretchingController';
import type CloningController from './CloningController/CloningController';
import type AlwaysSoundedController from './AlwaysSoundedController';
import type TimeSavedTracker from './TimeSavedTracker';
import extensionSettings2ControllerSettings from './extensionSettings2ControllerSettings';
import { HotkeyAction, HotkeyBinding } from '@/hotkeys';
import type { keydownEventToActions } from '@/hotkeys';
import broadcastStatus from './broadcastStatus';
import once from 'lodash/once';
import debounce from 'lodash/debounce';
import { mediaElementSourcesMap } from '@/content/audioContext';

type SomeController = StretchingController | CloningController | AlwaysSoundedController;

export type TelemetryMessage =
  SomeController['telemetry']
  & TimeSavedTracker['timeSavedData']
  & {
    controllerType: ControllerKind,
    elementLikelyCorsRestricted: boolean,
    elementCurrentSrc?: string,
    createMediaElementSourceCalledForElement: boolean,
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
  T extends ControllerKind.STRETCHING ? typeof StretchingController
  : T extends ControllerKind.CLONING ? typeof CloningController
  : T extends ControllerKind.ALWAYS_SOUNDED ? typeof AlwaysSoundedController
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
  // https://webaudio.github.io/web-audio-api/#MediaElementAudioSourceOptions-security and
  // https://github.com/WofWca/jumpcutter/issues/47),
  // so it's not that we only are unable to analyze it - the user also becomes unable to hear its sound.
  // The following is to avoid that.
  //
  // Actually, the fact that a source is cross-origin doesn't guarantee that `MediaElementAudioSourceNode`
  // will output silence. For example, if the media data is served with `Access-Control-Allow-Origin`
  // header set to `document.location.origin`. But currently it's not easy to detect that. See
  // https://github.com/WebAudio/web-audio-api/issues/2453.
  // It's better to not attach to an element than to risk muting it as it's more confusing to the user.
  return settings.dontAttachToCrossOriginMedia && elementSourceIsCrossOrigin
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
      ({ default: Controller } = await import(
        /* webpackExports: ['default'] */
        './StretchingController/StretchingController'
      ));
      break;
    }
    case ControllerKind.CLONING: {
      ({ default: Controller } = await import(
        /* webpackExports: ['default'] */
        './CloningController/CloningController'
      ));
      break;
    }
    case ControllerKind.ALWAYS_SOUNDED: {
      ({ default: Controller } = await import(
        /* webpackExports: ['default'] */
        './AlwaysSoundedController'
      ));
      break;
    }
    default: assertNever(kind);
  }
  type Hack = ConstructorParameters<typeof CloningController>;
  const controller = new Controller(...(getConstructorArgs() as Hack));
  return controller;
}

export default class AllMediaElementsController {
  activeMediaElement: HTMLMediaElement | undefined;
  activeMediaElementSourceIsCrossOrigin: boolean | undefined;
  unhandledNewElements = new Set<HTMLMediaElement>();
  handledElements = new WeakSet<HTMLMediaElement>();
  elementLastActivatedAt: number | undefined;
  controller: SomeController | undefined;
  timeSavedTracker: TimeSavedTracker | undefined;
  private settings: Settings | undefined;
  private _resolveDestroyedPromise!: () => void;
  private _destroyedPromise = new Promise<void>(r => this._resolveDestroyedPromise = r);
  // Whatever is added to `_destroyedPromise.then` doesn't need to be added to `_onDetachFromActiveElementCallbacks`,
  // it will be called in `destroy`.
  private _onDetachFromActiveElementCallbacks: Array<() => void> = [];

  constructor() {
    if (process.env.NODE_ENV !== 'production') {
      if (allMediaElementsControllerActive) {
        console.error("AllMediaElementsController is supposed to be a singletone, but it another was created while "
          + "one has not been destroyed");
      }
      allMediaElementsControllerActive = true;
    }

    // Keep in mind that this listener is also responsible for the desturction of this instance in case
    // `enabled` gets changed to `false`.
    const reactToStorageChanges = (changes: MyStorageChanges) => {
      this.reactToSettingsNewValues(settingsChanges2NewValues(changes));
    }
    addOnStorageChangedListener(reactToStorageChanges);
    this._destroyedPromise.then(() => removeOnStorageChangedListener(reactToStorageChanges));
  }
  private destroy() {
    this.detachFromActiveElement();
    this._resolveDestroyedPromise();

    if (process.env.NODE_ENV !== 'production') {
      allMediaElementsControllerActive = false;
    }
  }
  private detachFromActiveElement() {
    // TODO It is possible to call this function before the `_onDetachFromActiveElementCallbacks` array has been filled
    // and `controller` has been assigned.
    // Also keep in mind that it's possible to never attached to any elements at all, even if `onNewMediaElements()`
    // has been called (see that function).
    this.controller?.destroy();
    this.controller = undefined;
    this._onDetachFromActiveElementCallbacks.forEach(cb => cb());
    this._onDetachFromActiveElementCallbacks = [];
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
              this.timeSavedTracker,
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
            assertDev(typeof this.activeMediaElementSourceIsCrossOrigin === 'boolean');
            assertDev(this.activeMediaElement);
            const elementLikelyCorsRestricted = this.activeMediaElementSourceIsCrossOrigin;
            const telemetryMessage: TelemetryMessage = {
              ...this.controller.telemetry,
              ...this.timeSavedTracker.timeSavedData,
              controllerType: (this.controller.constructor as any).controllerType,
              elementLikelyCorsRestricted,
              // `undefined` for performance.
              elementCurrentSrc: elementLikelyCorsRestricted ? this.activeMediaElement.currentSrc : undefined,
              // TODO check if the map lookup is too slow to do it several times per second.
              createMediaElementSourceCalledForElement: !!mediaElementSourcesMap.get(this.activeMediaElement),
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
    this._destroyedPromise.then(() => port.onMessage.removeListener(listener));
  }
  private _addOnConnectListener() {
    browser.runtime.onConnect.addListener(this.onConnect);
    this._destroyedPromise.then(() => browser.runtime.onConnect.removeListener(this.onConnect));
  }
  private ensureAddOnConnectListener = once(this._addOnConnectListener);

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

  private async esnureAttachToElement(el: HTMLMediaElement) {
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

    assertDev(this._onDetachFromActiveElementCallbacks.length === 0, 'I think `_onDetachFromActiveElementCallbacks` '
      + `should be empty here. Instead it it is ${this._onDetachFromActiveElementCallbacks.length} items long`);

    // Currently this is technically not required since `this.activeMediaElement` is immediately reassigned
    // in the line above after the `detachFromActiveElement` call.
    this._onDetachFromActiveElementCallbacks.push(() => this.activeMediaElement = undefined);

    await this.ensureLoadSettings();
    assertDev(this.settings)

    let resolveTimeSavedTrackerPromise: (timeSavedTracker: TimeSavedTracker) => void;
    const timeSavedTrackerPromise = new Promise<TimeSavedTracker>(r => resolveTimeSavedTrackerPromise = r);

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
    this._onDetachFromActiveElementCallbacks.push(() => el.removeEventListener('loadstart', onMaybeSourceChange));

    const controllerP = importAndCreateController(
      getAppropriateControllerType(this.settings, elCrossOrigin),
      () => [
        el,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        extensionSettings2ControllerSettings(this.settings!),
        timeSavedTrackerPromise,
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
    (async () => {
      const { default: TimeSavedTracker } = await import(
        /* webpackExports: ['default'] */
        './TimeSavedTracker'
      );
      await controllerP; // It doesn't make sense to measure its effectiveness if it hasn't actually started working yet.
      const timeSavedTracker = this.timeSavedTracker = new TimeSavedTracker(
        el,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.settings!,
        addOnStorageChangedListener,
        removeOnStorageChangedListener,
      );
      this._onDetachFromActiveElementCallbacks.push(() => timeSavedTracker.destroy());

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      resolveTimeSavedTrackerPromise!(timeSavedTracker);
    })();

    await controllerP;
    hotkeyListenerP && await hotkeyListenerP;
    await timeSavedTrackerPromise;

    this.ensureAddOnConnectListener();
    // Not doing this at the beginning of the function, beside `this.activeMediaElement = el;` because the popup
    // considers that `elementLastActivatedAt !== undefined` means that it's free to connect, but
    // `ensureAddOnConnectListener` can still have not been called. TODO refactor?
    this.elementLastActivatedAt = calledAt;
    this.broadcastStatus();
  }

  private ensureAttachToEventTargetElement = (e: Event) => {
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

      el.addEventListener('play', this.ensureAttachToEventTargetElement, { passive: true });
      this._destroyedPromise.then(() => el.removeEventListener('play', this.ensureAttachToEventTargetElement));
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
        if (
          el.currentTime > 0
          // It is possilble for an element to have `currentTime > 0` while having its `readyState === HAVE_NOTHING`.
          // For example, this can happen if a website resumes playback from where the user stopped watching it on
          // another occasion (e.g. Odysee). Or with streams. This is mostly to ensure that we don't attach to
          // an element until its `currentSrc` is set to check if it cross-origin or not.
          // If this happens, we'll attach to it later, on a 'play' event.
          && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
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
