<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ResolveType } from '@/helpers';
  import { addOnChangedListener, getSettings, setSettings, Settings, settingsChanges2NewValues } from '@/settings';
  import RangeSlider from './RangeSlider.svelte';
  import Chart from './Chart.svelte';
  import type Controller from '@/content/Controller';
  import type createKeydownListener from './hotkeys';
  import throttle from 'lodash/throttle';

  let settings: Settings;

  let settingsLoaded = false;
  let settingsPromise = getSettings();
  settingsPromise.then(s => {
    settings = s;
    settingsLoaded = true;
  })

  let latestTelemetryRecord: ReturnType<Controller['getTelemetry']>;
  const telemetryUpdatePeriod = 0.02;
  let telemetryTimeoutId: number;
  const startGettingstelemetryP = (async function startGettingTelemetry() {
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
    telemetryTimeoutId = (function sendGetTelemetryAndScheduleAnother() {
      volumeInfoPort.postMessage('getTelemetry');
      return (setTimeout as typeof window.setTimeout)(sendGetTelemetryAndScheduleAnother, telemetryUpdatePeriod * 1000);
    })();
  })();
  // Well, actaully we don't currently require this, because this component gets destroyed only when the document gets
  // destroyed.
  onDestroy(async () => {
    await startGettingstelemetryP;
    clearTimeout(telemetryTimeoutId);
  });

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

  addOnChangedListener(changes => {
    settings = {
      ...settings,
      ...settingsChanges2NewValues(changes)
    };
  });

  function saveSettings(settings: Settings) {
    setSettings(settings);
  }
  // Debounce, otherwise continuously adjusting "range" inputs with mouse makes it lag real bad.
  // TODO but wot if use requestAnimationFrame instead of opinionated milliseconds?
  const throttledSaveSettings = throttle(saveSettings, 50);
  $: onSettingsChange = settingsLoaded
    ? throttledSaveSettings
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
  <div style="display: flex; justify-content: center;">
    <label class="enabled-input">
      <input
        bind:checked={settings.enabled}
        type="checkbox"
        autofocus={settings.popupAutofocusEnabledInput}
      >
      <span>Enabled</span>
    </label>
  </div>
  <!-- TODO but this is technically a button. Is this ok? -->
  <a
    id="options-button"
    href="javascript;"
    on:click={() => chrome.runtime.openOptionsPage()}
  >⚙️</a>
  <!-- How about {#if settings.popupChartHeightPx > 0 && settings.popupChartWidthPx > 0} -->
  <Chart
    {latestTelemetryRecord}
    volumeThreshold={settings.volumeThreshold}
    loadedPromise={settingsPromise}
    widthPx={settings.popupChartWidthPx}
    heightPx={settings.popupChartHeightPx}
    lengthSeconds={settings.popupChartLengthInSeconds}
  />
  <RangeSlider
    label="Volume threshold"
    min="0"
    max={maxVolume}
    step="0.0005"
    bind:value={settings.volumeThreshold}
  />
  <datalist id="sounded-speed-datalist">
    <option>1</option>
  </datalist>
  <!-- Max and max of silenceSpeed and soundedSpeed should be the same, so they can be visually compared.
  Also min should be 0 for the same reason. -->
  <RangeSlider
    label="Sounded speed"
    list="sounded-speed-datalist"
    fractionalDigits={2}
    min="0"
    max="15"
    step="0.1"
    bind:value={settings.soundedSpeed}
  />
  <!-- Be aware, at least Chromim doesn't allow to set values higher than 16:
  https://github.com/chromium/chromium/blob/46326599815cf2577efd7479d36946ea4a649083/third_party/blink/renderer/core/html/media/html_media_element.cc#L169-L171. -->
  <RangeSlider
    label="Silence speed"
    fractionalDigits={2}
    min="0"
    max="15"
    step="0.1"
    bind:value={settings.silenceSpeed}
  />
  <RangeSlider
    label="Margin after"
    min="0"
    max="0.5"
    step="0.005"
    bind:value={settings.marginAfter}
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
    bind:value={settings.marginBefore}
  />
  {/if}
{/await}

<style>
  label:not(:first-child) {
    margin-top: 1rem;
  }

  .enabled-input {
    margin: 1.75rem 0;
    display: flex;
    align-items: center;
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
