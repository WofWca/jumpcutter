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
  async function getTab() {
    return new Promise<chrome.tabs.Tab>(r => {
      // TODO but what about Kiwi browser? It always opens popup on a separate page. And in general, it's not always
      // guaranteed that there will be a tab, is it?
      chrome.tabs.query({ active: true, currentWindow: true, }, tabs => r(tabs[0]))
    });
  }
  const tabPromise = getTab();
  const tabLoadedPromise = (async () => {
    let tab = await tabPromise;
    if (tab.status !== 'complete') { // TODO it says `status` is optional? When is it missing?
      tab = await new Promise(r => {
        let pollTimeout: ReturnType<typeof setTimeout>;
        function finishIfComplete(tab: chrome.tabs.Tab) {
          if (tab.status === 'complete') {
            r(tab);
            chrome.tabs.onUpdated.removeListener(onUpdatedListener);
            clearTimeout(pollTimeout);
            return true;
          }
        }
        const onUpdatedListener: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (tabId, _, updatedTab) => {
          if (tabId !== tab.id) return;
          finishIfComplete(updatedTab);
        }
        chrome.tabs.onUpdated.addListener(onUpdatedListener);

        // Sometimes if you open the popup during page load, it would never resolve. I tried attaching the listener
        // before calling `chrome.tabs.query`, but it didn't help either. This is a workaround. TODO.
        async function queryTabStatusAndScheduleAnotherIfNotFinished() {
          const tab = await getTab();
          const finished = finishIfComplete(tab);
          if (!finished) {
            pollTimeout = setTimeout(queryTabStatusAndScheduleAnotherIfNotFinished, 2000);
          }
        }
        pollTimeout = setTimeout(queryTabStatusAndScheduleAnotherIfNotFinished, 2000);
      });
    }
    return tab;
  })();

  const connectedPromise = new Promise(async r => {
    const tab = await tabPromise;
    const onMessageListener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (message, sender) => {
      if (sender.tab?.id !== tab.id) return;
      // TODO check sender.url? Not only to check protocol, but also to somehow aid the user to locate the file that
      // he's trying to open. Idk how though, we can't just `input.value = sender.url`.
      if (message !== 'contentPortsReady') return; // TODO DRY. 
      chrome.runtime.onMessage.removeListener(onMessageListener);
      r();
    };
    chrome.runtime.onMessage.addListener(onMessageListener);
    chrome.tabs.sendMessage(tab.id!, 'checkContentPortReady') // TODO DRY.
  });

  let considerConnectionFailed = false;
  (async () => {
    await tabLoadedPromise;
    window.setTimeout(async () => {
      considerConnectionFailed = true;
      await connectedPromise; // May never resolve.
      considerConnectionFailed = false;
    }, 70);
  })();

  let latestTelemetryRecord: ReturnType<Controller['getTelemetry']>;
  const telemetryUpdatePeriod = 0.02;
  let telemetryTimeoutId: number;
  const startGettingstelemetryP = (async function startGettingTelemetry() {
    // TODO how do we close it on popup close? Do we have to?
    // https://developer.chrome.com/extensions/messaging#port-lifetime
    await connectedPromise;
    const tab = await tabLoadedPromise; // TODO are we sure that this guarantees that there's an onConnect listener?
    const telemetryPort = chrome.tabs.connect(tab.id!, { name: 'telemetry' });
    telemetryPort.onMessage.addListener(msg => {
      if (msg) {
        latestTelemetryRecord = msg;
      }
    });
    // TODO don't spam messages if the controller is not there.
    telemetryTimeoutId = (function sendGetTelemetryAndScheduleAnother() {
      telemetryPort.postMessage('getTelemetry');
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
  (async () => {
    await settingsPromise;
    await connectedPromise;
    if (!LISTEN_TO_HOTKEYS_IN_POPUP || !settings!.enableHotkeys) return;
    const { default: createKeydownListener } = (await import('./hotkeys'));
    keydownListener = await createKeydownListener(
      () => settings,
      newValues => {
        Object.assign(settings, newValues);
        settings = settings;
      },
    );
  })();

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

  $: silenceSpeedLabelClarification = settings?.silenceSpeedSpecificationMethod === 'relativeToSoundedSpeed'
    ? 'relative to sounded speed'
    : 'absolute';

  const maxVolume = 0.15;

  const openLocalFileLinkProps = {
    href: chrome.runtime.getURL('local-file-player/index.html'),
    target: '_new',
  };
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
  <!-- TODO transitions? -->
  {#await connectedPromise}
    <div
      class="content-script-connection-info"
      style="min-width: {settings.popupChartWidthPx}px; min-height: {settings.popupChartHeightPx}px;"
    >
      {#if considerConnectionFailed}
        <p>
          <span>⚠️ Couldn't load the content script.<br>Trying to </span>
          <!-- svelte-ignore a11y-missing-attribute --->
          <a
            {...openLocalFileLinkProps}
          >open a local file</a>?
        </p>
      {:else}
        <p>⏳ Loading...</p>
      {/if}
    </div>
  {:then _}
    <!-- How about {#if settings.popupChartHeightPx > 0 && settings.popupChartWidthPx > 0} -->
    <Chart
      {latestTelemetryRecord}
      volumeThreshold={settings.volumeThreshold}
      loadedPromise={settingsPromise}
      widthPx={settings.popupChartWidthPx}
      heightPx={settings.popupChartHeightPx}
      lengthSeconds={settings.popupChartLengthInSeconds}
    />
  {/await}
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
    label="Silence speed ({silenceSpeedLabelClarification})"
    fractionalDigits={2}
    min="0"
    max="15"
    step="0.1"
    bind:value={settings.silenceSpeedRaw}
  />
  <RangeSlider
    label="Margin before (side effects: audio distortion & audio delay)"
    min="0"
    max="0.5"
    step="0.005"
    bind:value={settings.marginBefore}
  />
  <RangeSlider
    label="Margin after"
    min="0"
    max="0.5"
    step="0.005"
    bind:value={settings.marginAfter}
  />
  {#if settings.popupAlwaysShowOpenLocalFileLink}
    <!-- svelte-ignore a11y-missing-attribute --->
    <a
      {...openLocalFileLinkProps}
      style="display: inline-block; margin-top: 1rem;"
    >Open a local file</a>
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

  .content-script-connection-info {
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
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
