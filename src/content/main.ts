import {
  Settings, getSettings, addOnChangedListener as addOnSettingsChangedListener, MyStorageChanges,
  removeOnChangedListener as removeOnSettingsChangedListener
} from '@/settings';
import { assert } from '@/helpers';
import type Controller from './Controller';

(async function () { // Just for top-level `await`

let controller: Controller | null = null;

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

const settings = await getSettings();

/** This listener must only be active when the controller is enabled. */
function onSettingsChangedWhileEnabled(changes: MyStorageChanges) {
  // Currently, this function is an event listener, and while it gets detached when the extension gets disabled, it
  // still gets executed on that change, because it gets detached within another event listener. This is to check if
  // this is the case.
  if (changes.enabled?.newValue === false) return;

  assert(!!controller);
  if (!changes.enableExperimentalFeatures) {
    // TODO also check for hotkey changes.
    const newValues: Partial<Settings> = {};
    for (const [settingName, change] of Object.entries(changes)) {
      (newValues[settingName as keyof Settings] as any) = change!.newValue;
    }
    controller.updateSettings(newValues);
  } else {
    // A change requires instance re-initialization.
    destroyIfInited();
    initIfVideoPresent()
  }
}

async function initIfVideoPresent() {
  const v = document.querySelector('video');
  if (!v) {
    // TODO search again when document updates? Or just after some time?
    console.log('Jump cutter: no video found. Exiting');
    return;
  }
  const settings = await getSettings();
  const { default: Controller } = await import(
    /* webpackMode: 'eager' */ // Why 'eager'? Because I can't get the default one to work.
    './Controller'
  );
  controller = new Controller(v, settings);
  controller.init();

  addOnSettingsChangedListener(onSettingsChangedWhileEnabled);
}

function destroyIfInited() {
  removeOnSettingsChangedListener(onSettingsChangedWhileEnabled);

  controller?.destroy();
  controller = null;
}

if (settings.enabled) {
  initIfVideoPresent();
}
// Watch the `enabled` setting. Other settings changes are handled by `onSettingsChangedWhileEnabled`.
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
