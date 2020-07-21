import defaultSettings from './defaultSettings.json';

(async function () { // Just for top-level `await`.

const numberRepresentationNumFractionalDigits = 3;

await new Promise(r => document.addEventListener('DOMContentLoaded', r));

/**
 * @param {Event} e
 */
document.getElementById('resetSoundedSpeed').onclick = function onResetSoundedSpeedClick(e) {
  const input = document.getElementById('soundedSpeed');
  input.value = 1.1;
  input.dispatchEvent(new Event('input'));
}

const enabledEl = document.getElementById('enabled');
const enableExperimentalFeaturesEl = document.getElementById('enable-experimental-features')
const numberInputsNames = [
  'volumeThreshold',
  'silenceSpeed',
  'soundedSpeed',
  'marginBefore',
  // 'marginAfter'
];

const volumeMeter = document.getElementById('volume-meter-value');
function updateVolumeMeterValue(volume) {
  volumeMeter.value = volume.toFixed(3);
  volumeMeter.nextElementSibling.innerText = parseFloat(volume).toFixed(numberRepresentationNumFractionalDigits);
}
updateVolumeMeterValue(0);

function reactToEnableExperimentalFeatures(newValue) {
  document.getElementById('marginBeforeField').style.display = newValue ? null : 'none';
}
const numberInputs = {};
numberInputsNames.forEach(n => {
  numberInputs[n] = document.getElementById(n)
});

const settings = await new Promise(r => chrome.storage.sync.get(defaultSettings, r));
Object.entries(numberInputs).forEach(([name, el]) => {
  el.value = settings[name];
});
enabledEl.checked = settings.enabled;
enableExperimentalFeaturesEl.checked = settings.enableExperimentalFeatures;
reactToEnableExperimentalFeatures(settings.enableExperimentalFeatures);

/**
 * @param {InputEvent} e
 */
function updateRangeNumberRepresentation(el) {
  el.nextElementSibling.innerText = parseFloat(el.value).toFixed(numberRepresentationNumFractionalDigits);
}
document.querySelectorAll('input[type="range"]').forEach(el => {
  updateRangeNumberRepresentation(el);
  el.addEventListener('input', e => updateRangeNumberRepresentation(e.target));
});

// TODO how do we close it on popup close? Do we have to?
// https://developer.chrome.com/extensions/messaging#port-lifetime
// TODO try-catch for "Receiving end does not exist", e.g. for when the page is being refreshed? Perhaps the content
// script should send a message for when it is ready to accept connections?
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const volumeInfoPort = chrome.tabs.connect(tabs[0].id, { name: 'telemetry' });
  const getTelemetryAndScheduleAnother = () => {
    volumeInfoPort.postMessage('getTelemetry');
    requestAnimationFrame(getTelemetryAndScheduleAnother);
  }
  volumeInfoPort.onMessage.addListener(msg => {
    if (msg) {
      updateVolumeMeterValue(msg.volume);
    }
  });
  // TODO don't spam messages if the controller is not there.
  getTelemetryAndScheduleAnother();
});

function saveSettings() {
  const newSettings = {
    enabled: enabledEl.checked,
    enableExperimentalFeatures: enableExperimentalFeaturesEl.checked,
  };
  Object.entries(numberInputs).forEach(([name, el]) => {
    newSettings[name] = parseFloat(el.value);
  });
  chrome.storage.sync.set(newSettings);
}
let saveSettingsDebounceTimeout = -1;
function debounceSaveSettings() {
  clearTimeout(saveSettingsDebounceTimeout);
  // TODO make sure settings are saved when the popup is closed.
  saveSettingsDebounceTimeout = setTimeout(saveSettings, 200);
}
enabledEl.addEventListener('input', saveSettings);
enableExperimentalFeaturesEl.addEventListener('input', saveSettings);
enableExperimentalFeaturesEl.addEventListener('input', e => {
  reactToEnableExperimentalFeatures(e.target.checked);
});
Object.values(numberInputs).forEach(el => {
  el.addEventListener('input', debounceSaveSettings);
});

})()
