<script>
  import { onMount } from 'svelte';
  import defaultSettings from '../defaultSettings.json';
  import RangeSlider from './RangeSlider';
  import Chart from './Chart';
  import throttle from 'lodash.throttle';

  let settings = { ...defaultSettings };
  if (process.env.NODE_ENV !== 'production') {
    function isPrimitive(value) {
      return ['boolean', 'string', 'number'].includes(typeof value) || [null, undefined].includes(value)
    }
    for (const [key, value] of Object.entries(defaultSettings)) {
      if (!isPrimitive(value)) {
        throw new Error('`defaultSettings` is now a more complex object, consider using lodash.clone instead to clone '
          + 'it');
      }
    }
  }

  let settingsLoaded = false;
  onMount(async () => {
    settings = await new Promise(r => chrome.storage.sync.get(defaultSettings, r));
    settingsLoaded = true;
  })

  function resetSoundedSpeed() {
    settings.soundedSpeed = 1.1;
  }

  const telemetryUpdatePeriod = 0.02;
  const telemetryHistoryMaxLengthSeconds = 3;
  const telemetryHistoryMaxLengthRecords = Math.floor(telemetryHistoryMaxLengthSeconds / telemetryUpdatePeriod);
  const telemetryHistory = [];
  let disposeOfOutdatedTelemetry = () => {
    if (telemetryHistory.length >= telemetryHistoryMaxLengthRecords - 1) {
      disposeOfOutdatedTelemetry = () => telemetryHistory.shift();
    }
  };
  (async function startGettingTelemetry() {
    // TODO how do we close it on popup close? Do we have to?
    // https://developer.chrome.com/extensions/messaging#port-lifetime
    // TODO try-catch for "Receiving end does not exist", e.g. for when the page is being refreshed? Perhaps the content
    // script should send a message for when it is ready to accept connections?
    const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const volumeInfoPort = chrome.tabs.connect(tabs[0].id, { name: 'telemetry' });
    volumeInfoPort.onMessage.addListener(msg => {
      if (msg) {
        disposeOfOutdatedTelemetry();
        telemetryHistory.push(msg);
        telemetryHistory = telemetryHistory;
        if (process.env.NODE_ENV !== 'production') {
          if (telemetryHistory.length > telemetryHistoryMaxLengthRecords) {
            console.error('`telemetryHistory` max size exceeded. May be a memory leak.');
          }
        }
      }
    });
    // TODO don't spam messages if the controller is not there.
    setInterval(() => volumeInfoPort.postMessage('getTelemetry'), telemetryUpdatePeriod * 1000);
  })();

  function saveSettings(settings) {
    chrome.storage.sync.set(settings);
  }
  const throttleSaveSettings = throttle(saveSettings, 200);
  $: onSettingsChange = settingsLoaded
    ? throttleSaveSettings
    : () => {};
  $: {
    onSettingsChange(settings);
  }

  const maxVolume = 0.15;
</script>

<label class="enabled-input">
  <input
    bind:checked={settings.enabled}
    type="checkbox"
    autofocus
  >
  <span>Enabled</span>
</label>
<Chart
  history={telemetryHistory}
  volumeThreshold={settings.volumeThreshold}
/>
<!-- <label>Volume</label>
<div class="volume-meter-wrapper">
  <meter
    value={currVolume}
    max={maxVolume}
  ></meter>
  <span
    class="volume-meter-number-representation"
  >{currVolume.toFixed(3)}</span>
</div> -->
<RangeSlider
  label="Volume threshold"
  value={settings.volumeThreshold}
  on:input={({ detail }) => settings.volumeThreshold = detail}
  min="0"
  max={maxVolume}
  step="0.0005"
/>
<!-- Max and max of silenceSpeed and soundedSpeed should be the same, so they can be visually compared.
Also min should be 0 for the same reason. -->
<RangeSlider
  label="Sounded speed"
  value={settings.soundedSpeed}
  on:input={({ detail }) => settings.soundedSpeed = detail}
  min="0"
  max="15"
  step="0.1"
/>
<button
  on:click={resetSoundedSpeed}
  type="button"
>Reset to 1.1 (not 1 to avoid glitches)</button>
<!-- Be aware, at least Chromim doesn't allow to set values higher than 16. -->
<RangeSlider
  label="Silence speed"
  value={settings.silenceSpeed}
  on:input={({ detail }) => settings.silenceSpeed = detail}
  min="0"
  max="15"
  step="0.1"
/>

<label class="enable-experimental-features-field">
  <input
    bind:checked={settings.enableExperimentalFeatures}
    type="checkbox"
  >
  <span>Experimental features</span>
</label>
{#if settings.enableExperimentalFeatures}
<RangeSlider
  label="Before margin"
  value={settings.marginBefore}
  on:input={({ detail }) => settings.marginBefore = detail}
  min="0"
  max="0.3"
  step="0.005"
/>
{/if}
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

<style>
  label:not(:first-child) {
    margin-top: 1rem;
  }

  .enabled-input {
    margin: 2rem 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
  }
  .enabled-input > input {
    width: 2rem;
    height: 2rem;
  }
  .enabled-input > span {
    margin: 0 0.5rem;
  }

  .enable-experimental-features-field {
    display: flex;
    align-items: center;
  }

  #repo-link {
    margin-top: 1rem;
    display: block;
    text-align: end;
  }
</style>
