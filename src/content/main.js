import Controller from './Controller';
import defaultSettings from '../defaultSettings';

chrome.storage.sync.get(
  defaultSettings,
  function (settings) {
    if (!settings.enabled) {
      return;
    }

    const video = document.querySelector('video');
    if (video === null) {
      // TODO search again when document updates? Or just after some time?
      console.log('Jump cutter: no video found. Exiting');
      return;
    }
    const controller = new Controller(video, settings);

    chrome.storage.onChanged.addListener(function (changes) {
      controller.updateSettings(changes);
    });

    controller.init();
  }
);
