import defaultSettings from '../defaultSettings';

(async function () { // Just for top-level `await`
/**
 * @type {null | Controller}
 */
let controller = null;

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
    port.postMessage(controller && controller.getTelemetry() || null);
  });
});

const settings = await new Promise(r => chrome.storage.sync.get(defaultSettings, r));

async function initIfVideoPresent() {
  const v = document.querySelector('video');
  if (!v) {
    // TODO search again when document updates? Or just after some time?
    console.log('Jump cutter: no video found. Exiting');
    return;
  }
  const settings = await new Promise(r => chrome.storage.sync.get(defaultSettings, r));
  const { default: Controller } = await import(
    /* webpackMode: 'eager' */ // Why 'eager'? Because I can't get the default one to work.
    './Controller'
  );
  controller = new Controller(v, settings);
  controller.init();
}

if (settings.enabled) {
  initIfVideoPresent();
}

chrome.storage.onChanged.addListener(function (changes) {
  // Don't need to check if it's already initialized/deinitialized because it's a setting CHANGE, and it's already
  // initialized/deinitialized in accordance to the setting a few lines above.
  if (changes.enabled != undefined) {
    if (changes.enabled.newValue === false) {
      // `if` because it might not have been created because there's no video.
      if (controller) {
        controller.destroy();
        controller = null;
      }
    } else {
      initIfVideoPresent();
    }
  }

  if (controller) {
    if (!changes.enableExperimentalFeatures) {
      const newValues = {};
      for (const [settingName, change] of Object.entries(changes)) {
        newValues[settingName] = change.newValue;
      }
      controller.updateSettings(newValues);
    } else {
      // A change requires instance re-initialization.
      controller.destroy();
      controller = null;
      initIfVideoPresent()
    }
  }
});

})();
