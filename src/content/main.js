import Controller from './Controller';
import defaultSettings from '../defaultSettings';

chrome.storage.sync.get(
  defaultSettings,
  function (settings) {
    /**
     * @type {null | Controller}
     */
    let controller = null;

    function watchInstanceSettings(changes) {
      const newValues = {};
      for (const [settingName, change] of Object.entries(changes)) {
        newValues[settingName] = change.newValue;
      }
      controller.updateSettings(newValues);
    }
    function initIfVideoPresent() {
      const v = document.querySelector('video');
      if (!v) {
        // TODO search again when document updates? Or just after some time?
        console.log('Jump cutter: no video found. Exiting');
        return;
      }
      chrome.storage.sync.get(
        defaultSettings,
        function (settings) {
          controller = new Controller(v, settings);
          chrome.storage.onChanged.addListener(watchInstanceSettings);
          controller.init();
        }
      );
    }

    if (settings.enabled) {
      initIfVideoPresent();
    }

    chrome.storage.onChanged.addListener(function (changes) {
      // Don't need to check if it's already initialized/deinitialized because it's a setting CHANGE, and it's already
      // initialized/deinitialized in accordance to the setting a few lines above.
      if (changes.enabled != undefined) {
        if (changes.enabled.newValue === false) {
          controller.destroy();
          controller = null;
          chrome.storage.onChanged.removeListener(watchInstanceSettings);
        } else {
          initIfVideoPresent();
        }
      }
    });
  }
);
