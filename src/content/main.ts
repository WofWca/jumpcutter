import {
  Settings, getSettings, setSettings, addOnChangedListener as addOnSettingsChangedListener, MyStorageChanges,
  removeOnChangedListener as removeOnSettingsChangedListener,
  settingsChanges2NewValues,
} from '@/settings';
import { assert, assertNever } from '@/helpers';
import type Controller from './Controller';
import { extensionSettings2ControllerSettings } from './Controller';
import { HotkeyAction, HotkeyBinding } from '@/hotkeys';
import type { keydownEventToActions } from '@/hotkeys';

(async function () { // Just for top-level `await`

// The user might have enabled access to file URL for this extension. This is so it behaves the same way when access
// is disabled. And why do we need that? Because it doesn't work with local files:
// https://github.com/WofWca/jumpcutter/issues/5
if (location.protocol === 'file:') {
  return;
}

let v: HTMLVideoElement | null = null;
let controller: Controller | null = null;
let handleKeydown: (e: KeyboardEvent) => void;

// TODO can we not do this when `enabled` is false?
chrome.runtime.onConnect.addListener(port => {
  switch (port.name) {
    case 'telemetry': {
      port.onMessage.addListener(msg => {
        if (process.env.NODE_ENV !== 'production') {
          if (msg !== 'getTelemetry') {
            throw new Error('Unsupported message type')
          }
        }
        port.postMessage(controller?.initialized && controller.getTelemetry() || null);
      });
      break;
    }
    case 'nonSettingsActions': {
      port.onMessage.addListener(msg => {
        if (v) {
          executeNonSettingsActions(msg);
        }
      });
      break;
    }
    default: {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(`Unrecognized port name "${port.name}"`);
      }
    }
  }
});
function notifyReady() {
  const contentScriptPortsReadyMessage = 'contentPortsReady'; // TODO DRY this?
  chrome.runtime.sendMessage(contentScriptPortsReadyMessage);
}
chrome.runtime.onMessage.addListener((message) => {
  if (process.env.NODE_ENV !== 'production') {
    if (message !== 'checkContentPortReady') { // TODO DRY.
      console.error('Unrecognized message', message);
    }
  }

  notifyReady();
});
// So it sends the message automatically when it loads, in case the popup was opened while the page is loading.
notifyReady();

let settings: Settings | null = await getSettings();

// These listeners must only be active when the controller is enabled.
// TODO how about we instead put them inside the `initIfVideoPresent()` function.
function reactToSettingsNewValues(newValues: Partial<Settings>) {
  // Currently, this function is an event listener, and while it gets detached when the extension gets disabled, it
  // still gets executed on that change, because it gets detached within another event listener. This is to check if
  // this is the case.
  if (newValues.enabled === false) return;

  if (Object.keys(newValues).length === 0) return;

  assert(controller);
  assert(settings);
  Object.assign(settings, newValues);
  controller.updateSettings(
    extensionSettings2ControllerSettings(settings) // TODO creating a new object on each settings change? SMH.
  );
}
function reactToSettingsChanges(changes: MyStorageChanges) {
  reactToSettingsNewValues(settingsChanges2NewValues(changes));
}

function executeNonSettingsActions(nonSettingsActions: ReturnType<typeof keydownEventToActions>['nonSettingsActions']) {
  assert(v);
  for (const action of nonSettingsActions) {
    switch (action.action) {
      case HotkeyAction.REWIND: v.currentTime -= (action as HotkeyBinding<HotkeyAction.REWIND>).actionArgument; break;
      case HotkeyAction.ADVANCE: v.currentTime += (action as HotkeyBinding<HotkeyAction.ADVANCE>).actionArgument; break;
      case HotkeyAction.TOGGLE_PAUSE: v.paused ? v.play() : v.pause(); break;
      case HotkeyAction.TOGGLE_MUTE: v.muted = !v.muted; break;
      default: assertNever(action.action);
    }
  }
}

async function initIfVideoPresent() {
  v = document.querySelector('video');
  if (!v) {
    // TODO search again when document updates? Or just after some time?
    console.log('Jump cutter: no video found. Exiting');
    return;
  }
  settings = await getSettings();

  const controllerP = (async () => {
    const { default: Controller } = await import(
      /* webpackMode: 'eager' */ // Why 'eager'? Because I can't get the default one to work.
      './Controller'
    );
    controller = new Controller(v, extensionSettings2ControllerSettings(settings));
    controller.init();
  })();

  let hotkeyListenerP;
  if (settings.enableHotkeys) {
    hotkeyListenerP = (async () => {
      const { keydownEventToActions, eventTargetIsInput } = await import(
        /* webpackMode: 'eager' */
        /* webpackExports: ['keydownEventToActions', 'eventTargetIsInput'] */
        '@/hotkeys'
      );
      // TODO how about put this into './hotkeys.ts' in the form of a curried function that takes arguments that look
      // something like `getSettings: () => Settings`?
      handleKeydown = (e: KeyboardEvent) => {
        if (eventTargetIsInput(e)) return;
        assert(settings);
        // TODO show what changed on the popup text.
        const actions = keydownEventToActions(e, settings);
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
        reactToSettingsNewValues(settingsNewValues);
        setSettings(settingsNewValues);

        executeNonSettingsActions(nonSettingsActions);
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
    })();
  }

  // TODO start listening before the components have been fully initialized so setting changes can't be missed.
  await controllerP;
  hotkeyListenerP && await hotkeyListenerP;
  addOnSettingsChangedListener(reactToSettingsChanges);
}

function destroyIfInited() {
  removeOnSettingsChangedListener(reactToSettingsChanges);
  document.removeEventListener('keydown', handleKeydown, true);

  controller?.destroy();
  controller = null;

  settings = null;
}

if (settings.enabled) {
  initIfVideoPresent();
}
// Watch the `enabled` setting. Other settings changes are handled by `reactToSettingsChanges`.
addOnSettingsChangedListener(function (changes) {
  // Don't need to check if it's already initialized/deinitialized because it's a setting CHANGE, and it's already
  // initialized/deinitialized in accordance to the setting a few lines above.
  if (changes.enabled != undefined) {
    if (changes.enabled.newValue === false) {
      destroyIfInited();
    } else {
      initIfVideoPresent();
    }
  }
});

})();
