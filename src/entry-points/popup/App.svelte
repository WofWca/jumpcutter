<!--
Copyright (C) 2020, 2021, 2022  WofWca <wofwca@protonmail.com>

This file is part of Jump Cutter Browser Extension.

Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Jump Cutter Browser Extension is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';
  import { onDestroy } from 'svelte';
  import {
    addOnStorageChangedListener, getSettings, setSettings, Settings, settingsChanges2NewValues,
    ControllerKind_CLONING, ControllerKind_STRETCHING, changeAlgorithmAndMaybeRelatedSettings,
    PopupAdjustableRangeInputsCapitalized,
    ControllerKind_ALWAYS_SOUNDED,
    OppositeDayMode_ON,
    OppositeDayMode_OFF,
    OppositeDayMode_HIDDEN_BY_USER,
    OppositeDayMode_UNDISCOVERED,
  } from '@/settings';
  import { tippyActionAsyncPreload as tippy } from './tippyAction';
  import RangeSlider from './RangeSlider.svelte';
  import type { TelemetryMessage } from '@/entry-points/content/AllMediaElementsController';
  import {
    HotkeyAction,
    HotkeyAction_INCREASE_VOLUME_THRESHOLD,
    HotkeyAction_DECREASE_VOLUME_THRESHOLD,
    HotkeyAction_TOGGLE_VOLUME_THRESHOLD,
    HotkeyAction_SET_VOLUME_THRESHOLD,
    HotkeyAction_INCREASE_SOUNDED_SPEED,
    HotkeyAction_DECREASE_SOUNDED_SPEED,
    HotkeyAction_TOGGLE_SOUNDED_SPEED,
    HotkeyAction_SET_SOUNDED_SPEED,
    HotkeyAction_INCREASE_SILENCE_SPEED,
    HotkeyAction_DECREASE_SILENCE_SPEED,
    HotkeyAction_TOGGLE_SILENCE_SPEED,
    HotkeyAction_SET_SILENCE_SPEED,
    HotkeyAction_INCREASE_MARGIN_BEFORE,
    HotkeyAction_DECREASE_MARGIN_BEFORE,
    HotkeyAction_TOGGLE_MARGIN_BEFORE,
    HotkeyAction_SET_MARGIN_BEFORE,
    HotkeyAction_INCREASE_MARGIN_AFTER,
    HotkeyAction_DECREASE_MARGIN_AFTER,
    HotkeyAction_TOGGLE_MARGIN_AFTER,
    HotkeyAction_SET_MARGIN_AFTER,
    HotkeyAction_TOGGLE_PAUSE,
    HotkeyBinding,
    NonSettingsAction
  } from '@/hotkeys';
  import type createKeydownListener from './hotkeys';
  import throttle from 'lodash/throttle';
  import { assertDev, getMessage } from '@/helpers';
  import { isMobile } from '@/helpers/isMobile';
  import type { Props as TippyProps } from 'tippy.js';
  import TimeSaved from './TimeSaved.svelte';
  import VolumeIndicator from './VolumeIndicator.svelte';

  // See ./popup.css. Would be cool to do this at build-time
  if (BUILD_DEFINITIONS.BROWSER === 'chromium') {
    document.body.classList.add('better-dark-border');
  }

  type RequiredSettings =
    Pick<Settings,
      'enabled'
      | 'applyTo'
      | 'popupAutofocusEnabledInput'
      | 'enableHotkeys'
      | 'silenceSpeedSpecificationMethod'
      | 'timeSavedAveragingMethod'
      | 'timeSavedAveragingWindowLength'
      | 'popupChartWidthPx'
      | 'popupChartHeightPx'
      | 'popupChartSpeed'
      | 'popupChartLengthInSeconds'
      | 'popupChartJumpPeriod'
      | 'dontAttachToCrossOriginMedia'
      | 'popupAlwaysShowOpenLocalFileLink'
      | 'advancedMode'
      | 'simpleSlider'
      | 'onPlaybackRateChangeFromOtherScripts'
      | 'hotkeys'
      | 'popupSpecificHotkeys'
      | 'oppositeDayMode'
    >
    & ReturnType<Parameters<typeof createKeydownListener>[1]>
    & Parameters<typeof changeAlgorithmAndMaybeRelatedSettings>[0]
    & Parameters<typeof rangeInputSettingNameToAttrs>[1];
  let settings: RequiredSettings;

  let settingsPromise = getSettings();
  settingsPromise.then(s => {
    settings = s;
  })
  function assignNewSettings(newValues: Partial<RequiredSettings>) {
    for (const [k_, v] of Object.entries(newValues)) {
      const k = k_ as keyof typeof newValues;
      (settings[k] as any) = v;
    }
  }
  async function getTab() {
    // TODO but what about Kiwi browser? It always opens popup on a separate page. And in general, it's not always
    // guaranteed that there will be a tab, is it?
    const tabs = await browserOrChrome.tabs.query({ active: true, currentWindow: true, });
    return tabs[0];
  }
  const tabPromise = getTab();
  const tabLoadedPromise = (async () => {
    let tab = await tabPromise;
    if (tab.status !== 'complete') { // TODO it says `status` is optional? When is it missing?
      tab = await new Promise(r => {
        let pollTimeout: ReturnType<typeof setTimeout>;
        function finishIfComplete(tab: browser.tabs.Tab | chrome.tabs.Tab) {
          if (tab.status === 'complete') {
            r(tab);
            browserOrChrome.tabs.onUpdated.removeListener(onUpdatedListener);
            clearTimeout(pollTimeout);
            return true;
          }
        }
        const onUpdatedListener = (
          tabId: number,
          _: unknown,
          updatedTab: browser.tabs.Tab | chrome.tabs.Tab
        ) => {
          if (tabId !== tab.id) return;
          finishIfComplete(updatedTab);
        }
        browserOrChrome.tabs.onUpdated.addListener(onUpdatedListener);

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

  let nonSettingsActionsPort: Omit<ReturnType<typeof browserOrChrome.tabs.connect>, 'postMessage'> & {
    postMessage: (actions: Array<HotkeyBinding<NonSettingsAction>>) => void;
  } | undefined;

  let resolveFirstTelemetryReceivedP: () => void;
  const firstTelemetryReceivedP = new Promise<void>(r => resolveFirstTelemetryReceivedP = r);
  let latestTelemetryRecord: TelemetryMessage | undefined;
  const telemetryUpdatePeriod = 0.02;
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

    const onMessageListener = (
      message: any,
      sender: chrome.runtime.MessageSender | browser.runtime.MessageSender
    ) => {
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
        const telemetryPort = browserOrChrome.tabs.connect(tab.id!, { name: 'telemetry', frameId });
        telemetryPort.onMessage.addListener(msg => {
          if (!msg) {
            return;
          }
          latestTelemetryRecord = msg as TelemetryMessage;
          resolveFirstTelemetryReceivedP();
        });
        let telemetryTimeoutId: ReturnType<typeof setTimeout>;
        (function sendGetTelemetryAndScheduleAnother() {
          telemetryPort.postMessage(IS_DEV_MODE ? 'getTelemetry' : undefined);
          telemetryTimeoutId = setTimeout(sendGetTelemetryAndScheduleAnother, telemetryUpdatePeriod * 1000);
        })();

        nonSettingsActionsPort = browserOrChrome.tabs.connect(tab.id!, { name: 'nonSettingsActions', frameId });

        disconnect = () => {
          clearTimeout(telemetryTimeoutId);
          telemetryPort.disconnect();
          nonSettingsActionsPort!.disconnect();
          nonSettingsActionsPort = undefined;
          disconnect = undefined;
        }
        considerConnectionFailed = false; // In case it timed out at first, but then succeeded some time later.
      }
    };
    browserOrChrome.runtime.onMessage.addListener(onMessageListener);
    browserOrChrome.tabs.sendMessage(tab.id!, 'checkContentStatus') // TODO DRY.
  })();

  (async () => {
    // Make a setings or a flag or something.
    const LISTEN_TO_HOTKEYS_IN_POPUP = true;
    await settingsPromise;
    if (LISTEN_TO_HOTKEYS_IN_POPUP && settings!.enableHotkeys) {
      const createKeydownListener = (await import(
        /* webpackExports: ['default'] */
        './hotkeys'
      )).default;
      keydownListener = createKeydownListener(
        nonSettingsActions => nonSettingsActionsPort?.postMessage(nonSettingsActions),
        () => settings,
        updateSettingsLocalCopyAndStorage,
      );
    }
  })();

  (async () => {
    await tabLoadedPromise;
    window.setTimeout(() => {
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
  // So we mitigate this by not updating the `settings` object with changes we got from `addOnStorageChangedListener`
  // until some time has passed since we last called `storage.set()`, to make sure that we have handled
  // these changes in the `addOnStorageChangedListener` callback.
  // TODO it's better to fix the root cause (i.e. not to react to same-source changes).
  let unhandledStorageChanges: Partial<Settings> | null = null;
  addOnStorageChangedListener(changes => {
    const newValues = settingsChanges2NewValues(changes);
    if (thisScriptRecentlyUpdatedStorage) {
      unhandledStorageChanges = { ...unhandledStorageChanges, ...newValues };
    } else {
      assignNewSettings(newValues);
    }
  });

  let thisScriptRecentlyUpdatedStorage = false;
  let thisScriptRecentlyUpdatedStorageTimeoud = -1;
  let settingsKeysToSaveToStorage = new Set<keyof typeof settings>();
  // `throttle` for performance, e.g. in case the user drags a slider (which makes the value change very often).
  const throttledSaveUnsavedSettingsToStorageAndTriggerCallbacks = throttle(() => {
    const newValues: Partial<typeof settings> = {};
    settingsKeysToSaveToStorage.forEach(key => {
      // @ts-expect-error 2322 they're both `Settings` or `Partial<Settings>` and the key is the same.
      newValues[key] = settings[key] as (typeof newValues)[typeof key];
    });
    setSettings(newValues);
    settingsKeysToSaveToStorage.clear();

    thisScriptRecentlyUpdatedStorage = true;
    clearTimeout(thisScriptRecentlyUpdatedStorageTimeoud);
    // TODO would `requestIdleCallback` work? Perhaps RIC + setTimeout?
    thisScriptRecentlyUpdatedStorageTimeoud = (setTimeout as typeof window.setTimeout)(
      () => {
        thisScriptRecentlyUpdatedStorage = false;
        if (unhandledStorageChanges) {
          assignNewSettings(unhandledStorageChanges);
          unhandledStorageChanges = null;
        }
      },
      500,
    );
  }, 50);
  function updateSettingsLocalCopyAndStorage(newValues: Partial<typeof settings>) {
    assignNewSettings(newValues);
    Object.keys(newValues).forEach(key => settingsKeysToSaveToStorage.add(key as keyof typeof newValues));
    throttledSaveUnsavedSettingsToStorageAndTriggerCallbacks();
  }
  function createOnInputListener(settingKey: keyof typeof settings) {
    // Why is the value argument not used? Because we use `bind:value` in addition.
    return () => {
      settingsKeysToSaveToStorage.add(settingKey);
      throttledSaveUnsavedSettingsToStorageAndTriggerCallbacks();
    };
  }

  function rangeInputSettingNameToAttrs(
    name: PopupAdjustableRangeInputsCapitalized,
    settings: Pick<Settings, `popup${typeof name}${'Min' | 'Max' | 'Step'}`>
  ) {
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


  $: silenceSpeedLabelClarification = settings?.silenceSpeedSpecificationMethod === 'relativeToSoundedSpeed'
    ? getMessage('relativeToSounded')
    : getMessage('absolute');

  function onChartClick() {
    nonSettingsActionsPort?.postMessage([{
      action: HotkeyAction_TOGGLE_PAUSE,
      keyCombination: { code: 'stub', }, // TODO this is dumb.
    }]);
  }

  const openLocalFileLinkProps = {
    href: browserOrChrome.runtime.getURL('local-file-player/index.html'),
    target: '_blank',
  } as const;
  // Firefox for Android acts weird and apparently opens this
  // the same way it opens popups, and then when you select a file,
  // nothing happens.
  // We want to open it in a separate tab therefore.
  const onClickOpenLocalFileLink = !isMobile
    ? undefined
    : (e: Event) => {
      e.preventDefault();
      browserOrChrome.tabs.create({
        url: browserOrChrome.runtime.getURL('local-file-player/index.html')
      });
      window.close();
    };

  function onUseExperimentalAlgorithmInput(e: Event) {
    const newControllerType = (e.target as HTMLInputElement).checked
      ? ControllerKind_CLONING
      : ControllerKind_STRETCHING
    const newValues = changeAlgorithmAndMaybeRelatedSettings(settings, newControllerType);
    updateSettingsLocalCopyAndStorage(newValues);
  }

  $: controllerTypeAlwaysSounded = latestTelemetryRecord?.controllerType === ControllerKind_ALWAYS_SOUNDED;

  const displayNewBadgeOnExperimentalAlgorithm = new Date() < new Date('2024-09-30');

  function onAdvancedModeChange(isOn: boolean) {
    settingsKeysToSaveToStorage.add('advancedMode');
    throttledSaveUnsavedSettingsToStorageAndTriggerCallbacks();

    if (!isOn) {
      updateSettingsLocalCopyAndStorage({
        experimentalControllerType: ControllerKind_STRETCHING,
        marginBefore: 0,
        // However, it's not very nice to change this setting,
        // because it can only be changed back from the options page.
        silenceSpeedSpecificationMethod: 'relativeToSoundedSpeed',
      })

      // Set the settings according to the `simpleSlider`'s value.
      onSimpleSliderInput();
    }
  }
  function onSimpleSliderInput() {
    settingsKeysToSaveToStorage.add('simpleSlider');
    throttledSaveUnsavedSettingsToStorageAndTriggerCallbacks();

    updateSettingsLocalCopyAndStorage({
      // If you decide to change these values,
      // remember to also update them in `defaultSettings.ts`.
      // When adjusting the values, keep in mind that _each_ of them
      // affects how much we skip, that is adjusting even just one of them
      // would make the extension skip more,
      // and adjusting all of them at the same time would make it skip
      // even more. So, keep them within sane, moderate limits.
      volumeThreshold: 0.001 + settings.simpleSlider * 0.00015,
      silenceSpeedRaw: 1.5 + settings.simpleSlider * 0.020,
      marginAfter: 0.03 + 0.0020 * (100 - settings.simpleSlider)
    })
  }

  let hotkeysActions: {[P in HotkeyAction]?: HotkeyBinding[]} = {};
  settingsPromise.then((settings) => {
    if (!settings.enableHotkeys) return;
    [...settings.hotkeys, ...settings.popupSpecificHotkeys].forEach((hotKey) => {
      const actionId = hotKey.action;
      if (!hotkeysActions[actionId]) hotkeysActions[actionId] = [];
      hotkeysActions[actionId].push(hotKey);
    });
  });

  /**
   * Example output: '\nDecrease: E, shift+E'.
   * If there is no hotkey for the `actionId`, returns an empty string.
   */
  function getActionString(actionId: HotkeyAction, actionName: string): string {
    const actionHotkeys = hotkeysActions[actionId];
    if (!actionHotkeys) return '';
    let actionString = '';
    actionHotkeys.forEach((hotkey: HotkeyBinding, i: number) => {
      let keysString = '';
      const modifiers = hotkey.keyCombination.modifiers;
      if (modifiers) {
        modifiers.forEach((modifier) => {
          keysString += modifier.replace('Key', '') + '+';
        });
      }

      actionString += keysString + hotkey.keyCombination.code.replace(/^Key/, '');
      if (actionHotkeys.length !== i + 1) {
        actionString += ', ';
      }
    });

    // Perhaps using placeholders when passing data to getMessage()
    // to allow translator to have more control over this
    // Also perhaps including ":" in the translation string
    // because it might also be translated in some languages.
    return '\n' + actionName + ': ' + actionString;
  }

  // `commands` API is currently not supported by Gecko for Android.
  const commandsPromise: undefined | ReturnType<typeof browserOrChrome.commands.getAll>
  = browserOrChrome.commands?.getAll?.();

  let toggleExtensionTooltip: undefined | Partial<TippyProps> = undefined;
  if (commandsPromise) {
    commandsPromise.then(commands => {
      commands.forEach(command => {
        if (command.name === 'toggle_enabled' && command.shortcut) {
          toggleExtensionTooltip = {
            content: getMessage("toggleSettingValue") + ': ' + command.shortcut,
            theme: 'my-tippy',
            placement: 'bottom',
          }
        }
      });
    });
  }

  let oppositeDayModeIsDiscoverable = false;
  (async () => {
    // Reveal the opposite day mode if the conditions are good.

    const now = new Date();
    const is1stOfApril = now.getDate() === 1 && now.getMonth() === 3;
    if (!is1stOfApril) {
      return
    }

    const settings = await settingsPromise;
    if (settings.oppositeDayMode !== OppositeDayMode_UNDISCOVERED) {
      // Already revealed, no need to do anything.
      return
    }
    // TODO perf: dyamically import whatever is below.

    await firstTelemetryReceivedP;
    assertDev(latestTelemetryRecord);

    // The opposite day mode is not as fun on the stretching controller.
    // Only the cloning one is fun, because it entirely skips "silence".
    if (latestTelemetryRecord.controllerType !== ControllerKind_CLONING) {
      return;
    }

    const timeSavedData = latestTelemetryRecord.sessionTimeSaved;

    // TODO fix: ahhh, this could be an exponentially decayed value,
    // it's not correct to just look at the absolute value.
    if (timeSavedData.wouldHaveLastedIfSpeedWasSounded < 2 * 60) {
      // Let's not turn on the opposite day mode yet,
      // it's too early to judge the average silence percentage
      // of the video.
      return
    }

    const timeSavedPercentage =
      timeSavedData.timeSavedComparedToSoundedSpeed /
      timeSavedData.wouldHaveLastedIfSpeedWasSounded;
    if (timeSavedPercentage < 0.20) {
      // If there is too little silence, we would have to skip too much,
      // and the cloning algorithm won't be able too keep up
      // playing the clone video. It won't be able to find the next
      // loud part in time, so we'd have to still play some
      // loud parts, which would ruin the effect.
      return
    }

    const remainingDuration = latestTelemetryRecord.elementRemainingIntrinsicDuration;
    if (Number.isNaN(remainingDuration) || remainingDuration < 5 * 60) {
      // Less than 5 minutes left, can't have much fun.
      return
    }

    oppositeDayModeIsDiscoverable = true;
  })();

</script>

<svelte:window
  on:keydown={keydownListener}
/>
{#await settingsPromise then _}
  <div style="display: flex; justify-content: space-between;">
    <div
      style="
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      "
    >
      <div style="margin-bottom: 0.375rem;">
        <!-- TODO style: when `toggleExtensionTooltip == undefined`,
        the tooltip is just empty. -->
        <label
        style="
        display: inline-flex;
        align-items: center;
        "
          use:tippy={toggleExtensionTooltip}
        >
          <!-- TODO it needs to be ensured that `on:change` (`on:input`) goes after `bind:` for all inputs.
          DRY? With `{...myBind}` or something?
          Also for some reason if you use `on:input` instead of `on:change` for this checkbox, it stops working.
          Maybe it's more proper to not rely on `bind:` -->
          <input
            bind:checked={settings.enabled}
            on:change={createOnInputListener('enabled')}
            type="checkbox"
            autofocus={settings.popupAutofocusEnabledInput}
          >
          <span>{getMessage('enable')}</span>
        </label>
      </div>
      {#if settings.advancedMode}
      <div style="margin-bottom: 0.375rem;">
        <VolumeIndicator {latestTelemetryRecord} {getActionString}/>
      </div>
      {/if}
    </div>
    <div
      style="
        display: flex;
        flex-direction: column;
        justify-content: space-between;

        text-align: right;
      "
    >
      {#if settings.advancedMode}
      <div style="margin-bottom: 0.375rem;">
        <!-- TODO but this is technically a button. Is this ok? -->
        <button
          on:click={() => {
            browserOrChrome.runtime.openOptionsPage();
            if (isMobile) {
              // The options tab gets opened, but it's not visible
              // because the popup stays open. Let's close it.
              window.close();
            }
          }}
          use:tippy={{
            content: () => getMessage('more'),
            theme: 'my-tippy',
          }}
        >⚙️</button>
      </div>
      {/if}
      <div style="margin-bottom: 0.375rem;">
        <TimeSaved {latestTelemetryRecord} {settings}/>
      </div>
    </div>
  </div>

  <!-- TODO transitions? -->
  <div
    style={
      `--popupChartWidth: ${settings.popupChartWidthPx}px;`
      + `--popupChartHeight: ${settings.popupChartHeightPx}px;`
      +'min-width: var(--popupChartWidth);'
      + 'min-height: var(--popupChartHeight);'
      + 'display: flex;'
      + 'align-items: center;'
    }
  >
  <div
    style={
      "min-width: 100%;"
      // So in Gecko it prefers to wrap instead of exceeding `settings.popupChartWidthPx`.
      + "width: min-content;"
    }
  >
  {#if !connected}
    <div class="content-script-connection-info">
      <!-- TODO should we add an {:else} block for the case when it's disabled and put something like a
      "enable the extension" button? Redundant tho. -->
      {#if settings.enabled}
        {#if considerConnectionFailed}
          {#if gotAtLeastOneContentStatusResponse}
            <p>
              <span>🤷‍♀️ {getMessage('noSuitableElement')}.</span>
              <br/>
              <!-- Maybe remove this button as we already have the "changeElementSearchCriteria" one?
              Also it's kind of confusing, because this button also qualifies as a one that changes
              the search criteria. -->
              <!-- TODO how about don't show this button when there are no such elements on the page
              (e.g. when `settings.applyTo !== 'videoOnly'` and there are no <audio> elements) -->
              {#if settings.applyTo !== 'both'}
                <button
                  on:click={async () => {
                    // TODO same issue as with "retry".
                    settings.applyTo = 'both';
                    await setSettings({ applyTo: 'both', enabled: false });
                    setSettings({ enabled: true });
                  }}
                  style="margin: 0.25rem"
                >🔍 {getMessage('alsoSearchFor', getMessage(settings.applyTo === 'videoOnly' ? 'audio' : 'video'))}</button>
              {/if}
              <!-- How about just suggesting unmuting the element first? -->
              <!-- TODO somehow highligth the related section after opening the options page? Or maybe it's Better
              to replace it with those very inputs from the options page? -->
              <button
                on:click={() => browserOrChrome.runtime.openOptionsPage()}
                style="margin: 0.25rem"
              >⚙️ {getMessage('changeElementSearchCriteria')}</button>
              <!-- Event though we now have implemented dynamic element search, there may still be some bug where this
              could be useful. -->
              <button
                on:click={async () => {
                  // TODO this flashes the parts of the UI that depend on the `enabled` setting, which doesn't look
                  // ideal.
                  await setSettings({ enabled: false });
                  setSettings({ enabled: true });
                }}
                style="margin: 0.25rem"
              >🔄 {getMessage('retry')}</button>
            </p>
          {:else}
            <p>
              ⚠️ {getMessage('contentScriptFail')}.<br>
              {#each getMessage('suggestOpenLocalFile', getMessage('openLocalFile')).split('**') as part, i}
                {#if i !== 1}
                  <span>{part}</span>
                {:else}
                  <!-- svelte-ignore a11y-missing-attribute --->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <a
                    {...openLocalFileLinkProps}
                    on:click={onClickOpenLocalFileLink}
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
    <!-- Keep in mind that on Firefox for Android YouTube won't play
    the video when the popup is open. This does _not_ apply to all websites. -->
    {#await import(
      /* webpackExports: ['default'] */
      './Chart.svelte'
    )}
      <div
        style={
          'min-width: var(--popupChartWidth);'
          + 'min-height: var(--popupChartHeight);'
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
        soundedSpeed={settings.soundedSpeed}
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
          on:dontAttachToCrossOriginMediaChange={({ detail }) => {
            updateSettingsLocalCopyAndStorage({ dontAttachToCrossOriginMedia: detail });
          }}
        />
      {/await}
    {/if}
  {/if}
  </div>
  </div>

  {#if !settings.advancedMode}
  <label
    style="
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
    "
  >
    <div style="display: flex; justify-content: space-between;">
      <div>{getMessage("skipLess")}</div>
      <div>{getMessage("skipMore")}</div>
    </div>
    <input
      type="range"
      min="0"
      max="100"
      bind:value={settings.simpleSlider}
      on:input={onSimpleSliderInput}
    />
  </label>
  {:else}
  <label
    use:tippy={{
      content: () => getMessage('useExperimentalAlgorithmTooltip'),
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
    <span>🧪</span>
    {#if displayNewBadgeOnExperimentalAlgorithm}
      <span>🆕</span>
    {/if}
    <span>&nbsp;{getMessage('useExperimentalAlgorithm')}</span>
  </label>
  {#if (
    // The opposite day mode only applies to the cloning controller.
    settings.experimentalControllerType === ControllerKind_CLONING
    && (
      settings.oppositeDayMode === OppositeDayMode_UNDISCOVERED
        ? oppositeDayModeIsDiscoverable
        : settings.oppositeDayMode !== OppositeDayMode_HIDDEN_BY_USER
    )
  )}
    <br>
    <label
      style="margin-top: 1rem; display: inline-flex; align-items: center;"
    >
      <input
        checked={settings.oppositeDayMode === OppositeDayMode_ON}
        on:change={e => {
          updateSettingsLocalCopyAndStorage({
            oppositeDayMode: e.currentTarget.checked
              ? OppositeDayMode_ON
              : OppositeDayMode_OFF
          })
        }}
        type="checkbox"
        style="margin: 0 0.5rem 0 0;"
      >
      <!-- TODO translation -->
      <span>🔀 Opposite day</span>
    </label>
  {/if}
  {#if latestTelemetryRecord?.clonePlaybackError}
    <p>
      <!-- This usually happens when the user has activated the experimental
      algoruthm _after_ the page has loaded, so we couldn't intercept
      and clone the original `MediaSource` in `cloneMediaSources`,
      which can be fixed by a page reload.
      If an error is caused by something else, a page reload might also help,
      (but I haven't seen this happen, at least on YouTube).
      -->
      <!-- Maybe we should just switch back
      to the stretching algorithm when this happens
      instead of bothering the user with warnings?? -->
      <!-- FYI "failed to analyze loudness" is confusing because
      we actually do show the current loudness,
      because we analyze the original element in parallel. -->
      <!-- <span>⚠️</span> -->
      <!-- <span>{getMessage('contentScriptFail')}</span><br> -->
      <span>Reload the page to restart loudness analysis</span>
      <!-- TODO improvement: i18n -->
      <button
        type="button"
        on:click={(e) => {
          tabPromise.then(tab => {
            // Keep in mind that the currently actuve tab and the tab
            // that we're currently connected to might not be the same tab,
            // e.g. if this popup is open in a separate tab.
            assertDev(tab.id)
            browserOrChrome.tabs.reload(tab.id);
          })
          const thisButton = e.target;
          assertDev(thisButton instanceof HTMLButtonElement)
          thisButton.disabled = true;
          setTimeout(() => thisButton.disabled = false, 5000);
        }}
      >🔄 Reload<!--  the page --></button>
    </p>
  {/if}
  <!-- TODO DRY `VolumeThreshold`? Like `'V' + 'olumeThreshold'`? Same for other inputs. -->
  <RangeSlider
    label="🔉 {getMessage('volumeThreshold')}"
    {...rangeInputSettingNameToAttrs('VolumeThreshold', settings)}
    bind:value={settings.volumeThreshold}
    on:input={createOnInputListener('volumeThreshold')}
    disabled={controllerTypeAlwaysSounded}
    useForInputParams={{
      content: () => {
        let tooltip = getMessage('volumeThresholdTooltip');
        const hotkeysString = getActionString(HotkeyAction_INCREASE_VOLUME_THRESHOLD, getMessage("increaseSettingValue")) +
        getActionString(HotkeyAction_DECREASE_VOLUME_THRESHOLD, getMessage("decreaseSettingValue")) +
        getActionString(HotkeyAction_TOGGLE_VOLUME_THRESHOLD, getMessage("toggleSettingValue")) +
        getActionString(HotkeyAction_SET_VOLUME_THRESHOLD, getMessage("setSettingValue"));

        if (hotkeysString) {
          tooltip += '\n' + hotkeysString;
        }

        return tooltip;
      },
      theme: tippyThemeMyTippyAndPreLine,
    }}
  />
  {/if}
  {#if (
    settings.advancedMode
    || settings.onPlaybackRateChangeFromOtherScripts !== 'updateSoundedSpeed'
  )}
  <datalist id="sounded-speed-datalist">
    <option>1</option>
  </datalist>
  <RangeSlider
    label="▶️ {getMessage('soundedSpeed')}"
    list="sounded-speed-datalist"
    fractionalDigits={2}
    {...rangeInputSettingNameToAttrs('SoundedSpeed', settings)}
    bind:value={settings.soundedSpeed}
    on:input={createOnInputListener('soundedSpeed')}
    useForInputParams={{
      content: () => {
        let tooltip = getMessage('soundedSpeedTooltip');
        const hotkeysString = getActionString(HotkeyAction_INCREASE_SOUNDED_SPEED, getMessage("increaseSettingValue")) +
        getActionString(HotkeyAction_DECREASE_SOUNDED_SPEED, getMessage("decreaseSettingValue")) +
        getActionString(HotkeyAction_TOGGLE_SOUNDED_SPEED, getMessage("toggleSettingValue")) +
        getActionString(HotkeyAction_SET_SOUNDED_SPEED, getMessage("setSettingValue"));

        if (hotkeysString) {
          tooltip += '\n' + hotkeysString;
        }

        return tooltip;
      },
      theme: tippyThemeMyTippyAndPreLine,
    }}
  />
  {/if}
  {#if settings.advancedMode}
  <RangeSlider
    label="⏩ {getMessage('silenceSpeed')} ({silenceSpeedLabelClarification})"
    fractionalDigits={2}
    {...rangeInputSettingNameToAttrs('SilenceSpeedRaw', settings)}
    bind:value={settings.silenceSpeedRaw}
    on:input={createOnInputListener('silenceSpeedRaw')}
    disabled={
      settings.experimentalControllerType === ControllerKind_CLONING
      || controllerTypeAlwaysSounded
    }
    useForInputParams={{
      content: () => {
        let tooltip = getMessage(
        'silenceSpeedTooltip',
        settings.silenceSpeedSpecificationMethod === 'relativeToSoundedSpeed'
          ? getMessage('silenceSpeedTooltipRelativeNote')
          : ''
        );

        const hotkeysString = getActionString(HotkeyAction_INCREASE_SILENCE_SPEED, getMessage("increaseSettingValue")) +
        getActionString(HotkeyAction_DECREASE_SILENCE_SPEED, getMessage("decreaseSettingValue")) +
        getActionString(HotkeyAction_TOGGLE_SILENCE_SPEED, getMessage("toggleSettingValue")) +
        getActionString(HotkeyAction_SET_SILENCE_SPEED, getMessage("setSettingValue"));

        if (hotkeysString) {
          tooltip += '\n' + hotkeysString;
        }

        return tooltip;

      },
      theme: tippyThemeMyTippyAndPreLine,
    }}
  />
  <RangeSlider
    label="⏱️⬅️ {getMessage('marginBefore')}"
    {...rangeInputSettingNameToAttrs('MarginBefore', settings)}
    bind:value={settings.marginBefore}
    on:input={createOnInputListener('marginBefore')}
    disabled={controllerTypeAlwaysSounded}
    useForInputParams={{
      content: () => {
        let tooltip = getMessage('marginBeforeTooltip');
        const hotkeysString = getActionString(HotkeyAction_INCREASE_MARGIN_BEFORE, getMessage("increaseSettingValue")) +
        getActionString(HotkeyAction_DECREASE_MARGIN_BEFORE, getMessage("decreaseSettingValue")) +
        getActionString(HotkeyAction_TOGGLE_MARGIN_BEFORE, getMessage('toggleSettingValue')) +
        getActionString(HotkeyAction_SET_MARGIN_BEFORE, getMessage('setSettingValue'));

        if (hotkeysString) {
          tooltip += '\n' + hotkeysString;
        }

        return tooltip;
      },
      theme: tippyThemeMyTippyAndPreLine,
    }}
  />
  <RangeSlider
    label="⏱️➡️ {getMessage('marginAfter')}"
    {...rangeInputSettingNameToAttrs('MarginAfter', settings)}
    bind:value={settings.marginAfter}
    on:input={createOnInputListener('marginAfter')}
    disabled={controllerTypeAlwaysSounded}
    useForInputParams={{
      content: () => {
        let tooltip = getMessage('marginAfterTooltip');
        const hotkeysString = getActionString(HotkeyAction_INCREASE_MARGIN_AFTER, getMessage("increaseSettingValue")) +
        getActionString(HotkeyAction_DECREASE_MARGIN_AFTER, getMessage("decreaseSettingValue")) +
        getActionString(HotkeyAction_TOGGLE_MARGIN_AFTER, getMessage("toggleSettingValue")) +
        getActionString(HotkeyAction_SET_MARGIN_AFTER, getMessage('setSettingValue'));

        if (hotkeysString) {
          tooltip += '\n' + hotkeysString;
        }

        return tooltip;
      },
      theme: tippyThemeMyTippyAndPreLine,
    }}
  />
  {/if}
  <div
    style="
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      flex-wrap: wrap;
    "
  >
    {#if settings.popupAlwaysShowOpenLocalFileLink}
      <!-- svelte-ignore a11y-missing-attribute --->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <a
        class="capitalize-first-letter"
        {...openLocalFileLinkProps}
        on:click={onClickOpenLocalFileLink}
        style="margin-top: 1rem;"
      >📂 {getMessage('openLocalFile')}</a>
    {/if}
    <label
      style="
        display: inline-flex;
        align-items: center;
        margin-top: 1rem;
      "
    >
      <input
        type="checkbox"
        style="margin: 0px 0.5rem 0px 0px;"
        bind:checked={settings.advancedMode}
        on:change={e => onAdvancedModeChange(e.currentTarget.checked)}
      />
      {getMessage("popupAdvancedMode")}
    </label>
  </div>
{/await}

<style>
  body > label:not(:first-child) {
    margin-top: 1rem;
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

  .capitalize-first-letter::first-letter {
    text-transform: capitalize;
  }
</style>
