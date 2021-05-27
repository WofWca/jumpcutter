<script lang="ts">
  import browser from '@/webextensions-api';
  import { onDestroy } from 'svelte';
  import {
    addOnSettingsChangedListener, getSettings, setSettings, Settings, settingsChanges2NewValues,
    ControllerKind_CLONING, ControllerKind_STRETCHING,
  } from '@/settings';
  import { tippyActionAsyncPreload } from './tippyAction';
  import RangeSlider from './RangeSlider.svelte';
  import Chart from './Chart.svelte';
  import type { TelemetryMessage } from '@/content/AllMediaElementsController';
  import { HotkeyAction, HotkeyBinding, NonSettingsAction, } from '@/hotkeys';
  import type createKeydownListener from './hotkeys';
  import debounce from 'lodash/debounce';
  import throttle from 'lodash/throttle';
  import { fromS } from 'hh-mm-ss'; // TODO it could be lighter. Make a MR or merge it directly and modify.

  let settings: Settings;

  let settingsLoaded = false;
  let settingsPromise = getSettings();
  settingsPromise.then(s => {
    settings = s;
    settingsLoaded = true;
  })
  async function getTab() {
    // TODO but what about Kiwi browser? It always opens popup on a separate page. And in general, it's not always
    // guaranteed that there will be a tab, is it?
    const tabs = await browser.tabs.query({ active: true, currentWindow: true, });
    return tabs[0];
  }
  const tabPromise = getTab();
  const tabLoadedPromise = (async () => {
    let tab = await tabPromise;
    if (tab.status !== 'complete') { // TODO it says `status` is optional? When is it missing?
      tab = await new Promise(r => {
        let pollTimeout: ReturnType<typeof setTimeout>;
        function finishIfComplete(tab: browser.tabs.Tab) {
          if (tab.status === 'complete') {
            r(tab);
            browser.tabs.onUpdated.removeListener(onUpdatedListener);
            clearTimeout(pollTimeout);
            return true;
          }
        }
        const onUpdatedListener: Parameters<typeof browser.tabs.onUpdated.addListener>[0] = (tabId, _, updatedTab) => {
          if (tabId !== tab.id) return;
          finishIfComplete(updatedTab);
        }
        browser.tabs.onUpdated.addListener(onUpdatedListener);

        // Sometimes if you open the popup during page load, it would never resolve. I tried attaching the listener
        // before calling `browser.tabs.query`, but it didn't help either. This is a workaround. TODO.
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

  let nonSettingsActionsPort: Omit<ReturnType<typeof browser.tabs.connect>, 'postMessage'> & {
    postMessage: (actions: Array<HotkeyBinding<NonSettingsAction>>) => void;
  };

  let latestTelemetryRecord: TelemetryMessage;
  const telemetryUpdatePeriod = 0.02;
  let telemetryTimeoutId: number;
  let disconnect: undefined | (() => void);
  // Well, actaully we don't currently require this, because this component gets destroyed only when the document gets
  // destroyed.
  onDestroy(() => disconnect?.());
  $: connected = !!disconnect;
  let considerConnectionFailed = false;
  let gotAtLeastOneContentStatusResponse = false;
  let keydownListener: ReturnType<typeof createKeydownListener> | (() => {}) = () => {};
  (async () => {
    const tab = await tabPromise;
    let elementLastActivatedAt: number | undefined;

    const onMessageListener: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message, sender) => {
      if (
        sender.tab?.id !== tab.id
        || message.type !== 'contentStatus' // TODO DRY message types.
      ) return;
      gotAtLeastOneContentStatusResponse = true;
      // TODO check sender.url? Not only to check protocol, but also to somehow aid the user to locate the file that
      // he's trying to open. Idk how though, we can't just `input.value = sender.url`.
      if (
        message.elementLastActivatedAt // Nullish if no element is active, see `content/main.ts`.
        && (!elementLastActivatedAt || message.elementLastActivatedAt > elementLastActivatedAt)
      ) {
        disconnect?.();

        const frameId = sender.frameId!;
        elementLastActivatedAt = message.elementLastActivatedAt;

        // TODO how do we close it on popup close? Do we have to?
        // https://developer.chrome.com/extensions/messaging#port-lifetime
        const telemetryPort = browser.tabs.connect(tab.id!, { name: 'telemetry', frameId });
        telemetryPort.onMessage.addListener(msg => {
          if (msg) {
            latestTelemetryRecord = msg as TelemetryMessage;
          }
        });
        telemetryTimeoutId = (function sendGetTelemetryAndScheduleAnother() {
          // TODO remove `as any` (will need to fix type definitions, "@types/firefox-webext-browser").
          // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/Port#type
          telemetryPort.postMessage('getTelemetry' as any);
          return (setTimeout as typeof window.setTimeout)(sendGetTelemetryAndScheduleAnother, telemetryUpdatePeriod * 1000);
        })();

        nonSettingsActionsPort = browser.tabs.connect(tab.id!, { name: 'nonSettingsActions', frameId });

        (async () => {
          // Make a setings or a flag or something.
          const LISTEN_TO_HOTKEYS_IN_POPUP = true;
          await settingsPromise;
          if (LISTEN_TO_HOTKEYS_IN_POPUP && settings!.enableHotkeys) {
            const { default: createKeydownListener } = await import(
              /* webpackExports: ['default'] */
              './hotkeys'
            );
            keydownListener = createKeydownListener(
              nonSettingsActionsPort as any, // TODO remove as any
              () => settings,
              newValues => {
                Object.assign(settings, newValues);
                settings = settings;
              },
            );
          }
        })();

        disconnect = () => {
          clearTimeout(telemetryTimeoutId);
          telemetryPort.disconnect();
          nonSettingsActionsPort.disconnect();
          disconnect = undefined;
        }
        considerConnectionFailed = false; // In case it timed out at first, but then succeeded some time later.
      }
    };
    browser.runtime.onMessage.addListener(onMessageListener);
    browser.tabs.sendMessage(tab.id!, 'checkContentStatus') // TODO DRY.
  })();

  (async () => {
    await tabLoadedPromise;
    window.setTimeout(() => {
      const connected = !!disconnect;
      if (!connected) {
        considerConnectionFailed = true;
      }
    }, 70);
  })();

  // This is to react to settings changes outside the popup. Currently I don't really see how settings can change from
  // outside the popup while it is open, but let's play it safe.
  // Why debounce – because `addOnSettingsChangedListener` also reacts to settings changes from inside this
  // script itself and sometimes when settings change rapidly, `onChanged` callback may lag behind so
  // the `settings` object's state begins jumping between the old and new state.
  // TODO it's better to fix the root cause (i.e. not to react to same-source changes.
  let pendingChanges: Partial<Settings> = {};
  const debouncedApplyPendingChanges = debounce(
    () => {
      settings = { ...settings, ...pendingChanges }
      pendingChanges = {};
    },
    500,
  )
  addOnSettingsChangedListener(changes => {
    pendingChanges = Object.assign(pendingChanges, settingsChanges2NewValues(changes));
    debouncedApplyPendingChanges();
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

  function onChartClick() {
    nonSettingsActionsPort?.postMessage([{
      // TODO replace with `action: HotkeyAction.TOGGLE_PAUSE`. Now it says that `HotkeyAction` is undefined.
      action: 'pause_toggle' as HotkeyAction.TOGGLE_PAUSE,
      keyCombination: { code: 'stub', }, // TODO this is dumb.
    }]);
  }

  const maxVolume = 0.15;

  const openLocalFileLinkProps = {
    href: browser.runtime.getURL('local-file-player/index.html'),
    target: '_new',
  };

  function mmSs(s: number): string {
    return fromS(Math.round(s), 'mm:ss');
  }

  $: r = latestTelemetryRecord;
  // TODO I'd prefer to use something like [`with`](https://github.com/sveltejs/svelte/pull/4601)
  $: timeSavedComparedToSoundedSpeedPercent =
    (!r ? 0 : 100 * r.timeSavedComparedToSoundedSpeed / (r.wouldHaveLastedIfSpeedWasSounded || Number.MIN_VALUE)).toFixed(1) + '%';
  $: timeSavedComparedToSoundedSpeedAbs =
    mmSs(r?.timeSavedComparedToSoundedSpeed ?? 0);
  $: wouldHaveLastedIfSpeedWasSounded =
    mmSs(r?.wouldHaveLastedIfSpeedWasSounded ?? 0);
  $: timeSavedComparedToIntrinsicSpeedPercent =
    (!r ? 0 : 100 * r.timeSavedComparedToIntrinsicSpeed / (r.wouldHaveLastedIfSpeedWasIntrinsic || Number.MIN_VALUE)).toFixed(1) + '%';
  $: timeSavedComparedToIntrinsicSpeedAbs =
    mmSs(r?.timeSavedComparedToIntrinsicSpeed ?? 0);
  $: wouldHaveLastedIfSpeedWasIntrinsic =
    mmSs(latestTelemetryRecord?.wouldHaveLastedIfSpeedWasIntrinsic ?? 0);

  function onUseExperimentalAlgorithmInput(e: Event) {
    console.log(e.target)
    settings.experimentalControllerType = (e.target as HTMLInputElement).checked
      ? ControllerKind_CLONING
      : ControllerKind_STRETCHING
  }
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
    href="javascript:void(0)"
    on:click|preventDefault={() => browser.runtime.openOptionsPage()}
  >⚙️</a>
  <div class="others__wrapper">
    <!-- TODO work on accessibility for the volume indicator. https://atomiks.github.io/tippyjs/v6/accessibility. -->
    <span
      class="others__item"
      use:tippyActionAsyncPreload={{
        content: 'Volume',
        theme: 'my-tippy',
      }}
    >
      <!-- `min-width` because the emojis have different widths, so it remains constant. -->
      <span
        style="display: inline-block; min-width: 2.5ch;"
      >{(() => {
        if (!latestTelemetryRecord) return '🔉';
        const vol = latestTelemetryRecord.elementVolume;
        if (vol < 0.001) return '🔇';
        if (vol < 1/3) return '🔈';
        if (vol < 2/3) return '🔉';
        return '🔊';
      })()}</span>
      <!-- TODO how about we replace it with a range input. -->
      <meter
        min="0"
        max="1"
        value={latestTelemetryRecord?.elementVolume ?? 0}
        style="width: 6rem;"
      ></meter>
    </span>
    {#if settings.experimentalControllerType !== ControllerKind_CLONING}
    <!-- Why button? So the tooltip can be accessed with no pointer device. Any better ideas? -->
    <button
      type="button"
      class="others__item"
      style="border: none; padding: 0; background: unset; font: inherit;"
      use:tippyActionAsyncPreload={{
        content: `Time saved info.
${settings.timeSavedAveragingMethod === 'exponential'
? `Over the last ${mmSs(settings.timeSavedAveragingWindowLength)}.`
: ''
}
Numbers' meanings (in order):

${timeSavedComparedToSoundedSpeedPercent} – time saved compared to sounded speed, %
${settings.timeSavedAveragingMethod === 'exponential'
? '' :
`
${timeSavedComparedToSoundedSpeedAbs} – time saved compared to sounded speed, absolute

${wouldHaveLastedIfSpeedWasSounded} – how long playback would take at sounded speed without jump cuts`
}
${timeSavedComparedToIntrinsicSpeedPercent} – time saved compared to intrinsic speed, %
${settings.timeSavedAveragingMethod === 'exponential'
? '' :
`
${timeSavedComparedToIntrinsicSpeedAbs} – time saved compared to intrinsic speed, absolute

${wouldHaveLastedIfSpeedWasIntrinsic} – how long playback would take at intrinsic speed without jump cuts`
}`,
        theme: 'my-tippy white-space-pre-line',
        hideOnClick: false,
      }}
    >
      <span>⏱️</span>
      <span>{timeSavedComparedToSoundedSpeedPercent}</span>
      {#if settings.timeSavedAveragingMethod !== 'exponential'}
        <span>({timeSavedComparedToSoundedSpeedAbs} / {wouldHaveLastedIfSpeedWasSounded})</span>
      {/if}
      <span>/</span>
      <span>{timeSavedComparedToIntrinsicSpeedPercent}</span>
      {#if settings.timeSavedAveragingMethod !== 'exponential'}
        <span>({timeSavedComparedToIntrinsicSpeedAbs} / {wouldHaveLastedIfSpeedWasIntrinsic})</span>
      {/if}
    </button>
    {/if}
  </div>
  <!-- TODO transitions? -->
  {#if !connected}
    <div
      class="content-script-connection-info"
      style="min-width: {settings.popupChartWidthPx}px; min-height: {settings.popupChartHeightPx}px;"
    >
      <!-- TODO should we add an {:else} block for the case when it's disabled and put something like a
      "enable the extension" button? Redundant tho. -->
      {#if settings.enabled}
        {#if considerConnectionFailed}
          {#if gotAtLeastOneContentStatusResponse}
            <p>
              <span>⚠️ Could not find a suitable media element on the page.</span>
              <br/><br/>
              <!-- Event though we now have implemented dynamic element search, there may still be some bug where this
              could be useful. -->
              <button
                on:click={async () => {
                  settings.enabled = false;
                  // TODO it should be better to wait for `storage.set`'s callback instead of just `setTimeout`.
                  // TODO. No idea why, but sometimes the `enabled` setting becomes "false" after pressing this button.
                  // TODO also this flashes the parts of the UI that depend on the `enabled` setting, which doesn't look
                  // ideal.
                  setTimeout(() => {
                    settings.enabled = true;
                  }, 20);
                }}
              >Retry</button>
              <!-- TODO how about don't show this button when there are no such elements on the page
              (e.g. when `settings.applyTo !== 'videoOnly'` and there are no <audio> elements) -->
              {#if settings.applyTo !== 'both'}
                <br/><br/>
                <button
                  on:click={() => {
                    settings.applyTo = 'both'
                    settings.enabled = false;
                    // Hacky. Same as with the "Retry" button, but at least this one disappears.
                    setTimeout(() => {
                      settings.enabled = true;
                    }, 100);
                  }}
                >Also search for {settings.applyTo === 'videoOnly' ? 'audio' : 'video'} elements</button>
              {/if}
            </p>
          {:else}
            <p>
              <span>⚠️ Couldn't load the content script.<br>Trying to </span>
              <!-- svelte-ignore a11y-missing-attribute --->
              <a
                {...openLocalFileLinkProps}
              >open a local file</a>?
            </p>
          {/if}
        {:else}
          <p>⏳ Loading...</p>
        {/if}
      {/if}
    </div>
  {:else}
    <!-- How about {#if settings.popupChartHeightPx > 0 && settings.popupChartWidthPx > 0} -->
    <Chart
      {latestTelemetryRecord}
      volumeThreshold={settings.volumeThreshold}
      loadedPromise={settingsPromise}
      widthPx={settings.popupChartWidthPx}
      heightPx={settings.popupChartHeightPx}
      lengthSeconds={settings.popupChartLengthInSeconds}
      on:click={onChartClick}
      paused={settings.experimentalControllerType === ControllerKind_CLONING}
    />
  {/if}
  <label
    use:tippyActionAsyncPreload={{
      content: '* Bare minimum usability\n'
        + '* Allows skipping silent parts entirely instead of playing them at a faster rate\n'
        + '* Doesn\'t work on many websites (YouTube, Vimeo). Works for local files\n'
        + '* No audio distortion, delay or desync\n',
      theme: 'my-tippy white-space-pre-line',
    }}
    style="margin-top: 1rem; display: inline-flex; align-items: center;"
  >
    <input
      checked={settings.experimentalControllerType === ControllerKind_CLONING}
      on:input={onUseExperimentalAlgorithmInput}
      type="checkbox"
      style="margin: 0 0.5rem 0 0;"
    >
    <span>Use experimental algorithm</span>
  </label>
  <RangeSlider
    label="Volume threshold"
    min="0"
    max={maxVolume}
    step="0.0005"
    bind:value={settings.volumeThreshold}
    disabled={settings.experimentalControllerType === ControllerKind_CLONING}
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
    min="0.05"
    max="15"
    step="0.05"
    bind:value={settings.soundedSpeed}
  />
  <!-- Be aware, at least Chromim doesn't allow to set values higher than 16:
  https://github.com/chromium/chromium/blob/46326599815cf2577efd7479d36946ea4a649083/third_party/blink/renderer/core/html/media/html_media_element.cc#L169-L171. -->
  <RangeSlider
    label="Silence speed ({silenceSpeedLabelClarification})"
    fractionalDigits={2}
    min="0.05"
    max="15"
    step="0.05"
    bind:value={settings.silenceSpeedRaw}
    disabled={settings.experimentalControllerType === ControllerKind_CLONING}
  />
  <RangeSlider
    label="Margin before (side effects: audio distortion & audio delay)"
    min="0"
    max="0.5"
    step="0.005"
    bind:value={settings.marginBefore}
    disabled={settings.experimentalControllerType === ControllerKind_CLONING}
  />
  <RangeSlider
    label="Margin after"
    min="0"
    max="0.5"
    step="0.005"
    bind:value={settings.marginAfter}
    disabled={settings.experimentalControllerType === ControllerKind_CLONING}
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

  .others__wrapper {
    display: flex;
    justify-content: space-between;
    /* In case chart size is smol. */
    flex-wrap: wrap;
    margin: 0.25rem -0.25rem;
  }
  .others__item {
    margin: 0.25rem;
    white-space: nowrap;
  }

  /* Global because otherwise it's not applied. I think it's fine as we have to specify the theme explicitly anyway. */
  :global(.tippy-box[data-theme~='my-tippy']) {
    font-size: inherit;
  }
  :global(.tippy-box[data-theme~='white-space-pre-line']) {
    white-space: pre-line;
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
