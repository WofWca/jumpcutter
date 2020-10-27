<script lang="ts">
  import { ResolveType } from '@/helpers';
  import { getSettings, setSettings, Settings } from '@/settings';
  import RangeSlider from './RangeSlider.svelte';
  import Chart from './Chart.svelte';
  import type Controller from '@/content/Controller';
  import type createKeydownListener from './hotkeys';

  let settings: Settings;

  let settingsLoaded = false;
  let settingsPromise = getSettings();
  settingsPromise.then(s => {
    settings = s;
    settingsLoaded = true;
  })

  let latestTelemetryRecord: ReturnType<Controller['getTelemetry']>;
  const telemetryUpdatePeriod = 0.02;
  (async function startGettingTelemetry() {
    // TODO how do we close it on popup close? Do we have to?
    // https://developer.chrome.com/extensions/messaging#port-lifetime
    // TODO try-catch for "Receiving end does not exist", e.g. for when the page is being refreshed? Perhaps the content
    // script should send a message for when it is ready to accept connections?
    const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r)) as any;
    const volumeInfoPort = chrome.tabs.connect(tabs[0].id!, { name: 'telemetry' });
    volumeInfoPort.onMessage.addListener(msg => {
      if (msg) {
        latestTelemetryRecord = msg;
      }
    });
    // TODO don't spam messages if the controller is not there.
    setInterval(() => {
      volumeInfoPort.postMessage('getTelemetry')
    }, telemetryUpdatePeriod * 1000);
  })();

  // Make a setings or a flag or something.
  const LISTEN_TO_HOTKEYS_IN_POPUP = true;
  let keydownListener: ResolveType<ReturnType<typeof createKeydownListener>> | (() => {}) = () => {};
  settingsPromise.then(async () => {
    if (!LISTEN_TO_HOTKEYS_IN_POPUP || !settings.enableHotkeys) return;
    const { default: createKeydownListener } = (await import('./hotkeys'));
    keydownListener = await createKeydownListener(
      () => settings,
      newValues => {
        Object.assign(settings, newValues);
        settings = settings;
      },
    );
  })

  function saveSettings(settings: Settings) {
    setSettings(settings);
  }
  $: onSettingsChange = settingsLoaded
    ? saveSettings
    : () => {};
  $: {
    onSettingsChange(settings);
  }

  const maxVolume = 0.15;
</script>

<svelte:window
  on:keydown={keydownListener}
/>
{#await settingsPromise then _}
  <label class="enabled-input">
    <input
      bind:checked={settings.enabled}
      type="checkbox"
      autofocus={settings.popupAutofocusEnabledInput}
    >
    <span>Enabled</span>
  </label>
  <!-- TODO but this is technically a button. Is this ok? -->
  <a
    id="options-button"
    href="javascript;"
    on:click={() => chrome.runtime.openOptionsPage()}
  >⚙️</a>
  <Chart
    {latestTelemetryRecord}
    volumeThreshold={settings.volumeThreshold}
    loadedPromise={settingsPromise}
  />
  <RangeSlider
    label="Volume threshold"
    min="0"
    max={maxVolume}
    step="0.0005"
    value={settings.volumeThreshold}
    on:input={({ detail }) => settings.volumeThreshold = detail}
  />
  <datalist id="speed-datalist">
    <option>1</option>
  </datalist>
  <!-- Max and max of silenceSpeed and soundedSpeed should be the same, so they can be visually compared.
  Also min should be 0 for the same reason. -->
  <RangeSlider
    label="Sounded speed"
    list="speed-datalist"
    fractionalDigits={2}
    min="0"
    max="15"
    step="0.1"
    value={settings.soundedSpeed}
    on:input={({ detail }) => settings.soundedSpeed = detail}
  />
  <!-- Be aware, at least Chromim doesn't allow to set values higher than 16:
  https://github.com/chromium/chromium/blob/46326599815cf2577efd7479d36946ea4a649083/third_party/blink/renderer/core/html/media/html_media_element.cc#L169-L171. -->
  <RangeSlider
    label="Silence speed"
    list="speed-datalist"
    fractionalDigits={2}
    min="0"
    max="15"
    step="0.1"
    value={settings.silenceSpeed}
    on:input={({ detail }) => settings.silenceSpeed = detail}
  />
  <RangeSlider
    label="Margin after"
    min="0"
    max="0.5"
    step="0.005"
    value={settings.marginAfter}
    on:input={({ detail }) => settings.marginAfter = detail}
  />


  <label class="enable-experimental-features-field">
    <input
      bind:checked={settings.enableExperimentalFeatures}
      type="checkbox"
    >
    <span>Experimental features</span>
  </label>
  {#if settings.enableExperimentalFeatures}
  <!-- TODO when it's no longer an experimental feature, put it above the margin after input. -->
  <RangeSlider
    label="Margin before"
    min="0"
    max="0.5"
    step="0.005"
    value={settings.marginBefore}
    on:input={({ detail }) => settings.marginBefore = detail}
  />
  {/if}
{/await}

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

  #options-button {
    position: absolute;
    padding: 0.25rem;
    top: 0.75rem;
    right: 0.75rem;
    text-decoration: none;
    font-size: 1.125rem;
  }
</style>
