<script>
  import { onMount } from 'svelte';
  import defaultSettings from '../defaultSettings.json';

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

  onMount(async () => {
    settings = await new Promise(r => chrome.storage.sync.get(defaultSettings, r));
  })

  function resetSoundedSpeed() {
    settings.soundedSpeed = 1.1;
  }

  function toFixed(number) {
    return number.toFixed(3);
  }

  let currVolume = 0;
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
        currVolume = msg.volume;
      }
    });
    // TODO don't spam messages if the controller is not there.
    getTelemetryAndScheduleAnother();
  })();

  function saveSettings() {
    chrome.storage.sync.set(settings);
  }
  let saveSettingsDebounceTimeout = -1;
  function debounceSaveSettings() {
    clearTimeout(saveSettingsDebounceTimeout);
    // TODO make sure settings are saved when the popup is closed.
    saveSettingsDebounceTimeout = setTimeout(saveSettings, 200);
  }
  $: {
    // This is analogical to Vue's watch expression. Though I'm not sure if this isn't going to be optimized away on
    // some later release of something.
    settings;

    debounceSaveSettings(); // TODO not debounce for checkboxes,
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
<label>Volume</label>
<div class="volume-meter-wrapper">
  <meter
    value={currVolume}
    max={maxVolume}
  ></meter>
  <span
    class="volume-meter-number-representation"
  >{toFixed(currVolume)}</span>
</div>
<label class="volume-threshold-input">
  <span>Volume threshold</span>
  <!-- (default 0.010, recommended 0.001-0.030) -->
  <div class="range-and-value">
    <input
      bind:value={settings.volumeThreshold}
      type="range"
      min="0"
      max={maxVolume}
      step="0.0005"
    >
    <span
      aria-hidden="true"
      class="slider-number-representation"
    >{toFixed(settings.volumeThreshold)}</span>
  </div>
</label>
<!-- Max and max of silenceSpeed and soundedSpeed should be the same, so they can be visually compared.
Also min should be 0 for the same reason. -->
<label>
  Sounded speed (default 1.75)
  <div class="range-and-value">
    <input
      bind:value={settings.soundedSpeed}
      type="range"
      min="0"
      max="15"
      step="0.1"
    >
    <span
      aria-hidden="true"
      class="slider-number-representation"
    >{toFixed(settings.soundedSpeed)}</span>
  </div>
</label>
<button
  on:click={resetSoundedSpeed}
  type="button"
>Reset to 1.1 (not 1 to avoid glitches)</button>
<label>
  Silence speed (default 4)
  <!-- Be aware, at least Chromim doesn't allow to set values higher than 16. -->
  <div class="range-and-value">
    <input
      bind:value={settings.silenceSpeed}
      type="range"
      min="0"
      max="15"
      step="0.1"
    >
    <span
      aria-hidden="true"
      class="slider-number-representation"
    >{toFixed(settings.silenceSpeed)}</span>
  </div>
</label>
<label class="enable-experimental-features-field">
  <input
    bind:checked={settings.enableExperimentalFeatures}
    type="checkbox"
  >
  <span>Experimental features</span>
</label>
{#if settings.enableExperimentalFeatures}
<label>
  Before margin
  <div class="range-and-value">
    <input
      bind:value={settings.marginBefore}
      type="range"
      min="0"
      max="0.3"
      step="0.005"
    >
    <span
      aria-hidden="true"
      class="slider-number-representation"
    >{toFixed(settings.marginBefore)}</span>
  </div>
</label>
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
