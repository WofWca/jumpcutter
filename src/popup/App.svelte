<script lang="ts">
  import { onMount } from 'svelte';
  import defaultSettings from '@/defaultSettings.json';
  import RangeSlider from './RangeSlider.svelte';
  import Chart from './Chart.svelte';
  import throttle from 'lodash.throttle';
  import type Controller from '@/content/Controller';

  let settings = { ...defaultSettings };
  if (process.env.NODE_ENV !== 'production') {
    function isPrimitive(value: typeof defaultSettings[keyof typeof defaultSettings]) {
      return ['boolean', 'string', 'number'].includes(typeof value) || ([null, undefined] as any[]).includes(value)
    }
    for (const [key, value] of Object.entries(defaultSettings)) {
      if (!isPrimitive(value)) {
        throw new Error('`defaultSettings` is now a more complex object, consider using lodash.clone instead to clone '
          + 'it');
      }
    }
  }

  let settingsLoaded = false;
  let settingsPromise = new Promise<typeof defaultSettings>(r => chrome.storage.sync.get(defaultSettings, r as any));
  settingsPromise.then(s => {
    settings = s;
    settingsLoaded = true;
  })

  /**
   * Chromium uses different audio data pipelines for normal (1.0) and non-normal speeds, and
   * switching between them causes an audio glitch:
   * https://github.com/chromium/chromium/blob/8af9895458f5ac16b2059ca8a336da6367188409/media/renderers/audio_renderer_impl.h#L16-L17
   * This is to make it impossible for the user to set speed to no normal.
   * TODO give users an option (on the options page) to skip this transformation.
   */
  function transformSpeed(speed: number): number {
    // On Chromium 86.0.4240.99, it appears that 1.0 is not the only "normal" speed. It's a small proximity of 1.0.
    //
    // It's not the smallest, but a value close to the smallest value for which the audio
    // stream start going through the stretcher algorithm. Determined from a bit of experimentation.
    // TODO DRY this, as it may change.
    const smallestNonNormalAbove1 = 1.00105;
    // Actually I'm not sure if there's such a relation between the biggest and the smallest.
    const biggestNonNormalBelow1 = 1 - (smallestNonNormalAbove1 - 1);

    if (biggestNonNormalBelow1 < speed && speed < smallestNonNormalAbove1) {
      return smallestNonNormalAbove1 - speed < speed - biggestNonNormalBelow1
        ? biggestNonNormalBelow1
        : smallestNonNormalAbove1;
    }
    return speed;
  }

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

  function saveSettings(settings: typeof defaultSettings) {
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
<!-- There are 2 reasons to set the amount of fractional digits to 1 for speed:
1. Greater precision is not required, more precise numbers would just be harder to read.
2. Do not puzzle the user on why when he tries to set speed to 1, it never actually becomes 1 but 1.001 (see
`transformSpeed` function). -->
<RangeSlider
  label="Sounded speed"
  list="speed-datalist"
  fractionalDigits={2}
  min="0"
  max="15"
  step="0.1"
  value={settings.soundedSpeed}
  on:input={({ detail }) => settings.soundedSpeed = transformSpeed(detail)}
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
  on:input={({ detail }) => settings.silenceSpeed = transformSpeed(detail)}
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
