<script>
import defaultSettings from '../defaultSettings.json';

(async function () { // Just for top-level `await`.

const numberRepresentationNumFractionalDigits = 3;

const settingsPromise = new Promise(r => chrome.storage.sync.get(defaultSettings, r));
await new Promise(r => document.addEventListener('DOMContentLoaded', r));
const settings = await settingsPromise;
  // new Promise(r => chrome.storage.sync.get(defaultSettings, r))

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

(async function startGettingTelemetry() {
  // TODO how do we close it on popup close? Do we have to?
  // https://developer.chrome.com/extensions/messaging#port-lifetime
  // TODO try-catch for "Receiving end does not exist", e.g. for when the page is being refreshed? Perhaps the content
  // script should send a message for when it is ready to accept connections?
  const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
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
})();

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

})();
</script>

<label class="enabled-input">
  <input
    id="enabled"
    type="checkbox"
    autofocus
  >
  <span>Enabled</span>
</label>
<label>Volume</label>
<div class="volume-meter-wrapper">
  <meter
    id="volume-meter-value"
    max="0.15"
  ></meter>
  <span
    class="volume-meter-number-representation"
  ></span>
</div>
<label class="volume-threshold-input">
  <span>Volume threshold</span>
  <!-- (default 0.010, recommended 0.001-0.030) -->
  <div class="range-and-value">
    <input
      id="volumeThreshold"
      type="range"
      min="0"
      max="0.15"
      step="0.0005"
    >
    <span
      aria-hidden="true"
      class="slider-number-representation"
    />
  </div>
</label>
<!-- Max and max of silenceSpeed and soundedSpeed should be the same, so they can be visually compared.
Also min should be 0 for the same reason. -->
<label>
  Sounded speed (default 1.75)
  <div class="range-and-value">
    <input
      id="soundedSpeed"
      type="range"
      min="0"
      max="15"
      step="0.1"
    >
    <span
      aria-hidden="true"
      class="slider-number-representation"
    />
  </div>
</label>
<button
  type="button"
  id="resetSoundedSpeed"
>Reset to 1.1 (not 1 to avoid glitches)</button>
<label>
  Silence speed (default 4)
  <!-- Be aware, at least Chromim doesn't allow to set values higher than 16. -->
  <div class="range-and-value">
    <input
      id="silenceSpeed"
      type="range"
      min="0"
      max="15"
      step="0.1"
    >
    <span
      aria-hidden="true"
      class="slider-number-representation"
    />
  </div>
</label>
<label class="enable-experimental-features-field">
  <input
    id="enable-experimental-features"
    type="checkbox"
  >
  <span>Experimental features</span>
</label>
<label
  id="marginBeforeField"
  style="display: none;"
>
  Before margin
  <div class="range-and-value">
    <input
      id="marginBefore"
      type="range"
      min="0"
      max="0.3"
      step="0.005"
    >
    <span
      aria-hidden="true"
      class="slider-number-representation"
    />
  </div>
</label>
<!-- <label>
  After margin
  <input
    id="marginAfter"
    type="range"
    min="0"
    step="0.005"
  >
</label> -->
<a
  id="repo-link"
  target="new"
  href="https://github.com/WofWca/jumpcutter"
>About / feedback</a>
