import {
  Settings, getSettings, setSettings, addOnChangedListener as addOnSettingsChangedListener, MyStorageChanges,
  removeOnChangedListener as removeOnSettingsChangedListener,
  settingsChanges2NewValues,
} from '@/settings';
import { assert } from '@/helpers';
import type Controller from './Controller';

(async function () { // Just for top-level `await`

let controller: Controller | null = null;
let handleKeydown: (e: KeyboardEvent) => void;

// TODO can we not do this when `enabled` is false?
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'telemetry') {
    return;
  }
  port.onMessage.addListener(msg => {
    if (process.env.NODE_ENV !== 'production') {
      if (msg !== 'getTelemetry') {
        throw new Error('Unsupported message type')
      }
    }
    port.postMessage(controller?.initialized && controller.getTelemetry() || null);
  });
});

let settings: Settings | null = await getSettings();

// These listeners must only be active when the controller is enabled.
function reactToSettingsNewValues(newValues: Partial<Settings>) {
  // Currently, this function is an event listener, and while it gets detached when the extension gets disabled, it
  // still gets executed on that change, because it gets detached within another event listener. This is to check if
  // this is the case.
  if (newValues.enabled === false) return;

  if (Object.keys(newValues).length === 0) return;

  assert(!!controller);
  assert(!!settings);
  const oldSettings = settings;
  settings = { ...settings, ...newValues };
  if (oldSettings.enableExperimentalFeatures === settings.enableExperimentalFeatures) {
    // TODO also check for hotkey changes.
    controller.updateSettings(newValues);
  } else {
    // A change requires instance re-initialization.
    destroyIfInited();
    initIfVideoPresent()
  }
}
function reactToSettingsChanges(changes: MyStorageChanges) {
  reactToSettingsNewValues(settingsChanges2NewValues(changes));
}

async function initIfVideoPresent() {
  const v = document.querySelector('video');
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
    controller = new Controller(v, settings);
    controller.init();
  })();
  const hotkeyListenerP = (async () => {
    const { default: keydownEventToSettingsNewValues } = await import(
      /* webpackMode: 'eager' */
      './hotkeys'
    );
    handleKeydown = (e: KeyboardEvent) => {
      assert(!!settings);
      // TODO show what changed on the popup text.
      const newValues = keydownEventToSettingsNewValues(e, settings);
      // TODO but this will cause `reactToSettingsNewValues` to get called twice – immediately and on storage change.
      // Nothing critical, but not great for performance.
      // How about we only update the`settings` object synchronously (so sequential changes can be made, as
      // `keydownEventToSettingsNewValues` depends on it), but do not take any action until the onChanged event fires?
      reactToSettingsNewValues(newValues);
      setSettings(newValues);
    };
    // Adding the listener to `document` instead of `video` because some websites (like YouTube) use custom players,
    // which wrap around a video element, which is not ever supposed to be in focus.
    document.addEventListener('keydown', handleKeydown);
  })();

  // TODO start listening before the components have been fully initialized so setting changes can't be missed.
  await controllerP;
  await hotkeyListenerP;
  addOnSettingsChangedListener(reactToSettingsChanges);
}

function destroyIfInited() {
  removeOnSettingsChangedListener(reactToSettingsChanges);
  document.removeEventListener('keydown', handleKeydown);

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
