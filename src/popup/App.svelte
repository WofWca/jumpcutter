<script lang="ts">
  import browser from '@/webextensions-api';
  import { onDestroy } from 'svelte';
  import {
    addOnStorageChangedListener, getSettings, setSettings, Settings, settingsChanges2NewValues,
    ControllerKind_CLONING, ControllerKind_STRETCHING, changeAlgorithmAndMaybeRelatedSettings,
    PopupAdjustableRangeInputsCapitalized,
    ControllerKind_ALWAYS_SOUNDED,
  } from '@/settings';
  import { tippyActionAsyncPreload as tippy } from './tippyAction';
  import RangeSlider from './RangeSlider.svelte';
  import type { TelemetryMessage } from '@/content/AllMediaElementsController';
  import { HotkeyAction, HotkeyBinding, NonSettingsAction, } from '@/hotkeys';
  import type createKeydownListener from './hotkeys';
  import debounce from 'lodash/debounce';
  import throttle from 'lodash/throttle';
  import { fromS } from 'hh-mm-ss'; // TODO it could be lighter. Make a MR or merge it directly and modify.
  import { getMessage } from '@/helpers';

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

  let latestTelemetryRecord: TelemetryMessage | undefined;
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
    // Make a setings or a flag or something.
    const LISTEN_TO_HOTKEYS_IN_POPUP = true;
    await settingsPromise;
    if (LISTEN_TO_HOTKEYS_IN_POPUP && settings!.enableHotkeys) {
      const { default: createKeydownListener } = await import(
        /* webpackExports: ['default'] */
        './hotkeys'
      );
      keydownListener = createKeydownListener(
        nonSettingsActions => nonSettingsActionsPort?.postMessage(nonSettingsActions),
        () => settings,
        newValues => {
          Object.assign(settings, newValues);
          settings = settings;
        },
      );
    }
  })();

  (async () => {
    await tabLoadedPromise;
    window.setTimeout(() => {
      const connected = !!disconnect;
      if (!connected) {
        considerConnectionFailed = true;
      }
    }, 300);
  })();

  // This is to react to settings changes outside the popup. I think currently the only reasonable way they
  // can change from outside the popup while it's open is if you execute the `toggle_enabled` command (see
  // `initBrowserHotkeysListener.ts`).
  // Why debounce – because `addOnStorageChangedListener` also reacts to settings changes from inside this
  // (popup) script itself and sometimes when settings change rapidly, `onChanged` callback may lag behind so
  // the `settings` object's state begins jumping between the old and new state.
  // TODO it's better to fix the root cause (i.e. not to react to same-source changes).
  let pendingChanges: Partial<Settings> = {};
  const debouncedApplyPendingChanges = debounce(
    () => {
      settings = { ...settings, ...pendingChanges }
      pendingChanges = {};
    },
    500,
  )
  addOnStorageChangedListener(changes => {
    pendingChanges = Object.assign(pendingChanges, settingsChanges2NewValues(changes));
    debouncedApplyPendingChanges();
  });

  function saveSettings(settings: Settings) {
    setSettings(settings);
  }
  // `throttle` for performance, e.g. in case the user drags a slider (which makes the value change very often).
  const throttledSaveSettings = throttle(saveSettings, 50);
  $: onSettingsChange = settingsLoaded
    ? throttledSaveSettings
    : () => {};
  $: {
    onSettingsChange(settings);
  }

  function rangeInputSettingNameToAttrs(name: PopupAdjustableRangeInputsCapitalized, settings: Settings) {
    // TODO DRY?
    return {
      'useForInput': tippy,
      'min': settings[`popup${name}Min`],
      'max': settings[`popup${name}Max`],
      'step': settings[`popup${name}Step`],
    };
  }
  const tippyThemeMyTippy = 'my-tippy';
  const tippyThemeMyTippyAndPreLine = tippyThemeMyTippy + ' white-space-pre-line';

  let timeSavedTooltipContentEl: HTMLElement;

  $: silenceSpeedLabelClarification = settings?.silenceSpeedSpecificationMethod === 'relativeToSoundedSpeed'
    ? getMessage('relativeToSounded')
    : getMessage('absolute');

  function onChartClick() {
    nonSettingsActionsPort?.postMessage([{
      // TODO replace with `action: HotkeyAction.TOGGLE_PAUSE`. Now it says that `HotkeyAction` is undefined.
      action: 'pause_toggle' as HotkeyAction.TOGGLE_PAUSE,
      keyCombination: { code: 'stub', }, // TODO this is dumb.
    }]);
  }

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

  function formatTimeSaved(num: number) {
    return num.toFixed(2);
  }
  const dummyTimeSavedValues = [
    formatTimeSaved(1),
    formatTimeSaved(1), // TODO use `getAbsoluteClampedSilenceSpeed`?
  ] as [string, string];
  function getTimeSavedPlaybackRateEquivalents(
    r: TelemetryMessage | undefined
  ): [comparedToSounded: string, comparedToIntrinsic: string] {
    if (!r) {
      return dummyTimeSavedValues;
    }
    // `r.wouldHaveLastedIfSpeedWasIntrinsic - r.timeSavedComparedToIntrinsicSpeed` would be equivalent.
    const lastedActually = r.wouldHaveLastedIfSpeedWasSounded - r.timeSavedComparedToSoundedSpeed;
    if (lastedActually === 0) {
      return dummyTimeSavedValues;
    }
    return [
      formatTimeSaved(r.wouldHaveLastedIfSpeedWasSounded / lastedActually),
      formatTimeSaved(r.wouldHaveLastedIfSpeedWasIntrinsic / lastedActually),
    ]
  }
  function beetween(min: number, x: number, max: number): boolean {
    return min < x && x < max;
  }
  $: timeSavedPlaybackRateEquivalents = getTimeSavedPlaybackRateEquivalents(latestTelemetryRecord);
  $: timeSavedPlaybackRateEquivalentsAreDifferent =
    // Can't compare `timeSavedPlaybackRateEquivalents[0]` and `[1]` because due to rounding they can
    // jump between being the same and being different even if you don't change soundedSpeed.
    // Not simply doing a strict comparison (`!==`) because otherwise if you changed soundedSpeed for even
    // a moment, it would never stop showing both numbers.
    !beetween(
      1 / 1.02,
      (
        (r?.wouldHaveLastedIfSpeedWasSounded || Number.MIN_VALUE)
        / (r?.wouldHaveLastedIfSpeedWasIntrinsic || Number.MIN_VALUE)
      ),
      1.02,
    )
    // Also need to look at this because if `soundedSpeed` was > 1 at first and then it changed to < 1, there will
    // be a point where `wouldHaveLastedIfSpeedWasSounded` and `wouldHaveLastedIfSpeedWasIntrinsic` will become the
    // same (although for a brief moment), despite the soundedSpeed actually never being `=== 1`.
    || (settings && settings.soundedSpeed !== 1);
  // TODO DRY
  $: timeSavedOnlyOneNumberIsShown =
    !timeSavedPlaybackRateEquivalentsAreDifferent
    && settings?.timeSavedAveragingMethod === 'exponential';

  function onUseExperimentalAlgorithmInput(e: Event) {
    const newControllerType = (e.target as HTMLInputElement).checked
      ? ControllerKind_CLONING
      : ControllerKind_STRETCHING
    const newValues = changeAlgorithmAndMaybeRelatedSettings(settings, newControllerType);
    settings = {
      ...settings,
      ...newValues,
    };
  }

  $: controllerTypeAlwaysSounded = latestTelemetryRecord?.controllerType === ControllerKind_ALWAYS_SOUNDED;
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
      <span>{getMessage('enable')}</span>
    </label>
  </div>
  <!-- TODO but this is technically a button. Is this ok? -->
  <button
    id="options-button"
    on:click={() => browser.runtime.openOptionsPage()}
    use:tippy={{
      content: getMessage('more'),
      theme: 'my-tippy',
    }}
  >⚙️</button>
  <div class="others__wrapper">
    <!-- TODO work on accessibility for the volume indicator. https://atomiks.github.io/tippyjs/v6/accessibility. -->
    <span
      class="others__item"
      use:tippy={{
        content: getMessage('volume'),
        theme: tippyThemeMyTippyAndPreLine,
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
    <!-- Why button? So the tooltip can be accessed with no pointer device. Any better ideas? -->
    <button
      type="button"
      class="others__item"
      style="border: none; padding: 0; background: unset; font: inherit;"
      use:tippy={{
        content: timeSavedTooltipContentEl,
        theme: 'my-tippy',
        placement: 'bottom',
        hideOnClick: false,
      }}
    >
      <span>⏱️</span>
      <span>{timeSavedPlaybackRateEquivalents[0]}</span>
      {#if settings.timeSavedAveragingMethod !== 'exponential'}
        <span>({timeSavedComparedToSoundedSpeedAbs} / {wouldHaveLastedIfSpeedWasSounded})</span>
      {/if}
      <!-- Don't need to confuse the user with another number if they're equal anyway, especially they're one
      of those who use `soundedSpeed=1` -->
      {#if timeSavedPlaybackRateEquivalentsAreDifferent}
        <span>/</span>
        <span>{timeSavedPlaybackRateEquivalents[1]}</span>
        {#if settings.timeSavedAveragingMethod !== 'exponential'}
          <span>({timeSavedComparedToIntrinsicSpeedAbs} / {wouldHaveLastedIfSpeedWasIntrinsic})</span>
        {/if}
      {/if}

      <!-- TODO for performance it would be cool to disable reactivity when the tooltip is closed. -->
      <!-- TODO the contents are quite big and some locales (e.g. `ru`) may not fit in the default popup size. -->
      <div style="display:none">
        <div bind:this={timeSavedTooltipContentEl}>
          <p style="margin-top: 0.25rem;">
            <span>{getMessage('timeSaved')}.</span>
            {#if settings.timeSavedAveragingMethod === 'exponential'}
              <br>
              <span>{getMessage('overTheLast', mmSs(settings.timeSavedAveragingWindowLength))}.</span>
            {/if}
          </p>
          {#if !timeSavedOnlyOneNumberIsShown}
            <p>{getMessage('numbersMeanings')}</p>
          {/if}
          <ol style="padding-left: 2ch; margin-bottom: 0.25rem">
            <li
              style={timeSavedOnlyOneNumberIsShown ? 'list-style:none;' : ''}
            >{timeSavedPlaybackRateEquivalents[0]} – {getMessage('timeSavedComparedToSounded')}</li>
            {#if settings.timeSavedAveragingMethod !== 'exponential'}
              <li>{timeSavedComparedToSoundedSpeedAbs} – {getMessage('timeSavedComparedToSoundedAbs')}</li>
              <li>{wouldHaveLastedIfSpeedWasSounded} – {getMessage('wouldHaveLastedIfSpeedWasSounded')}</li>
            {/if}
            {#if timeSavedPlaybackRateEquivalentsAreDifferent}
              <li>{timeSavedPlaybackRateEquivalents[1]} – {getMessage('timeSavedComparedToIntrinsic')}</li>
              {#if settings.timeSavedAveragingMethod !== 'exponential'}
                <li>{timeSavedComparedToIntrinsicSpeedAbs} – {getMessage('timeSavedComparedToIntrinsicAbs')}</li>
                <li>{wouldHaveLastedIfSpeedWasIntrinsic} – {getMessage('wouldHaveLastedIfSpeedWasIntrinsic')}</li>
              {/if}
            {/if}
          </ol>
          <p
            style="margin-bottom: 0.25rem;"
          >{getMessage('timeSavedPercentage')}<br>
          {timeSavedComparedToSoundedSpeedPercent}
          {#if timeSavedPlaybackRateEquivalentsAreDifferent}
            / {timeSavedComparedToIntrinsicSpeedPercent}
          {/if}
          ({getMessage('comparedToSounded')}{
          #if timeSavedPlaybackRateEquivalentsAreDifferent}
            {' / '}{getMessage('comparedToIntrinsic')}{
          /if
          }).
          </p>
        </div>
      </div>
    </button>
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
              <span>⚠️ {getMessage('noSuitableElement')}.</span>
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
              >🔄 {getMessage('retry')}</button>
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
                >🔍 {getMessage('alsoSearchFor', getMessage(settings.applyTo === 'videoOnly' ? 'audio' : 'video'))}</button>
              {/if}
            </p>
          {:else}
            <p>
              ⚠️ {getMessage('contentScriptFail')}.<br>
              {#each getMessage('suggestOpenLocalFile', getMessage('openLocalFile')).split('**') as part, i}
                {#if i !== 1}
                  <span>{part}</span>
                {:else}
                  <!-- svelte-ignore a11y-missing-attribute --->
                  <a
                    {...openLocalFileLinkProps}
                  >{part}</a>
                {/if}
              {/each}
            </p>
          {/if}
        {:else}
          <p>⏳ {getMessage('loading')}...</p>
        {/if}
      {/if}
    </div>
  {:else}
    <!-- How about {#if settings.popupChartHeightPx > 0 && settings.popupChartWidthPx > 0} -->
    {#await import(
      /* webpackExports: ['default'] */
      './Chart.svelte'
    )}
      <div
        style={
          `min-width: ${settings.popupChartWidthPx}px;`
          + `min-height: ${settings.popupChartHeightPx}px;`
          // So there's less flashing when the chart gets loaded.
          // WET, see `soundedSpeedColor` in './Chart.svelte'
          + 'background: rgb(calc(0.7 * 255), 255, calc(0.7 * 255));'
        }
      >
        <!-- `await` so it doesnt get shown immediately so it doesn't flash -->
        {#await new Promise(r => setTimeout(r, 300)) then _}
          ⏳ {getMessage('loading')}...
        {/await}
      </div>
    {:then { default: Chart }}
      <!-- Need `{#key}` because the Chart component does not properly support switching from one controller
      type to another on the fly because it is is stateful (i.e. depends on older `TelemetryRecord`s).
      Try removing this and see if it works.
      If you're gonna remove this, consider also removing the `controllerType` property from `TelemetryRecord`.
      (a.k.a. revert this commit). -->
      {#key latestTelemetryRecord?.controllerType}
      <Chart
        {latestTelemetryRecord}
        volumeThreshold={settings.volumeThreshold}
        loadedPromise={settingsPromise}
        widthPx={settings.popupChartWidthPx}
        heightPx={settings.popupChartHeightPx}
        lengthSeconds={settings.popupChartLengthInSeconds}
        jumpPeriod={settings.popupChartJumpPeriod}
        timeProgressionSpeed={settings.popupChartSpeed}
        on:click={onChartClick}
        {telemetryUpdatePeriod}
      />
      {/key}
    {/await}
    <!-- TODO it an element is cross-origin and we called `createMediaElementSource` for it and it appears
    to produce sound, don't show the warning. -->
    {#if latestTelemetryRecord?.elementLikelyCorsRestricted}
      {#await import(
        /* webpackExports: ['default'] */
        './MediaUnsupportedMessage.svelte'
      )}
        <!-- `await` so it doesnt get shown immediately so it doesn't flash -->
        {#await new Promise(r => setTimeout(r, 300)) then _}
          ⏳ {getMessage('loading')}...
        {/await}
      {:then { default: MediaUnsupportedMessage }}
        <MediaUnsupportedMessage
          {latestTelemetryRecord}
          {settings}
          on:dontAttachToCrossOriginMediaChange={({ detail }) => settings.dontAttachToCrossOriginMedia = detail}
        />
      {/await}
    {/if}
  {/if}
  <label
    use:tippy={{
      content: getMessage('useExperimentalAlgorithmTooltip'),
      theme: tippyThemeMyTippyAndPreLine,
    }}
    style="margin-top: 1rem; display: inline-flex; align-items: center;"
  >
    <input
      checked={settings.experimentalControllerType === ControllerKind_CLONING}
      on:input={onUseExperimentalAlgorithmInput}
      disabled={controllerTypeAlwaysSounded}
      type="checkbox"
      style="margin: 0 0.5rem 0 0;"
    >
    <span>🧪 {getMessage('useExperimentalAlgorithm')}</span>
  </label>
  <!-- TODO async tooltip contents -->
  <!-- TODO DRY `VolumeThreshold`? Like `'V' + 'olumeThreshold'`? Same for other inputs. -->
  <RangeSlider
    label="🔉 {getMessage('volumeThreshold')}"
    {...rangeInputSettingNameToAttrs('VolumeThreshold', settings)}
    bind:value={settings.volumeThreshold}
    disabled={controllerTypeAlwaysSounded}
    useForInputParams={{
      content: getMessage('volumeThresholdTooltip'),
      theme: tippyThemeMyTippyAndPreLine,
    }}
  />
  <datalist id="sounded-speed-datalist">
    <option>1</option>
  </datalist>
  <RangeSlider
    label="▶️ {getMessage('soundedSpeed')}"
    list="sounded-speed-datalist"
    fractionalDigits={2}
    {...rangeInputSettingNameToAttrs('SoundedSpeed', settings)}
    bind:value={settings.soundedSpeed}
    useForInputParams={{
      content: getMessage('soundedSpeedTooltip'),
      theme: tippyThemeMyTippyAndPreLine,
    }}
  />
  <RangeSlider
    label="⏩ {getMessage('silenceSpeed')} ({silenceSpeedLabelClarification})"
    fractionalDigits={2}
    {...rangeInputSettingNameToAttrs('SilenceSpeedRaw', settings)}
    bind:value={settings.silenceSpeedRaw}
    disabled={
      settings.experimentalControllerType === ControllerKind_CLONING
      || controllerTypeAlwaysSounded
    }
    useForInputParams={{
      content: getMessage(
        'silenceSpeedTooltip',
        settings.silenceSpeedSpecificationMethod === 'relativeToSoundedSpeed'
          ? getMessage('silenceSpeedTooltipRelativeNote')
          : ''
      ),
      theme: tippyThemeMyTippyAndPreLine,
    }}
  />
  <RangeSlider
    label="⏱️⬅️ {getMessage('marginBefore')}"
    {...rangeInputSettingNameToAttrs('MarginBefore', settings)}
    bind:value={settings.marginBefore}
    disabled={controllerTypeAlwaysSounded}
    useForInputParams={{
      content: getMessage('marginBeforeTooltip'),
      theme: tippyThemeMyTippyAndPreLine,
    }}
  />
  <RangeSlider
    label="⏱️➡️ {getMessage('marginAfter')}"
    {...rangeInputSettingNameToAttrs('MarginAfter', settings)}
    bind:value={settings.marginAfter}
    disabled={controllerTypeAlwaysSounded}
    useForInputParams={{
      content: getMessage('marginAfterTooltip'),
      theme: tippyThemeMyTippyAndPreLine,
    }}
  />
  {#if settings.popupAlwaysShowOpenLocalFileLink}
    <!-- svelte-ignore a11y-missing-attribute --->
    <a
      class="capitalize-first-letter"
      {...openLocalFileLinkProps}
      style="display: inline-block; margin-top: 1rem;"
    >📂 {getMessage('openLocalFile')}</a>
  {/if}
{/await}

<style>
  body > label:not(:first-child) {
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
    padding: 0;
    top: 0.75rem;
    right: 0.75rem;
    font-size: 1.5rem;
  }

  .capitalize-first-letter::first-letter {
    text-transform: capitalize;
  }
</style>
