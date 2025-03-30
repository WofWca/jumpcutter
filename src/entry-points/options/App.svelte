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
  import { tick } from 'svelte';
  import HotkeysTable, { PotentiallyInvalidHotkeyBinding } from './components/HotkeysTable.svelte';
  import CheckboxField from './components/CheckboxField.svelte';
  import NumberField from './components/NumberField.svelte';
  import InputFieldBase from './components/InputFieldBase.svelte';
  import { cloneDeepJson, assertDev, assertNever, getMessage } from '@/helpers';
  import {
    defaultSettings,
    filterOutLocalStorageOnlySettings,
    getSettings,
    OppositeDayMode_HIDDEN_BY_USER,
    OppositeDayMode_OFF,
    OppositeDayMode_UNDISCOVERED,
    setSettings,
    Settings,
  } from "@/settings";
  import debounce from 'lodash/debounce';
  import {
    getDecayTimeConstant as getTimeSavedDataWeightDecayTimeConstant
  } from '@/entry-points/content/TimeSavedTracker';
  import isEqual from 'lodash/isEqual';
  import { browserHasAudioDesyncBug } from '@/helpers/browserHasAudioDesyncBug';

  let unsaved = false;
  let formValid = true;
  let formEl: HTMLFormElement;

  type PotentiallyInvalidSettingsChangedKeys = keyof Pick<Settings, 'hotkeys' | 'popupSpecificHotkeys'>;
  type PotentiallyInvalidSettings = Omit<Settings, PotentiallyInvalidSettingsChangedKeys> & {
    hotkeys: PotentiallyInvalidHotkeyBinding[];
    popupSpecificHotkeys: PotentiallyInvalidHotkeyBinding[];
  }
  let settings: PotentiallyInvalidSettings;
  let originalSettings: Settings;
  // Yes, calling `getSettings` in order to get two clones, because we're gonna mutate `settings`.
  const settingsPromise = getSettings();
  const originalSettingsPromise = getSettings();
  settingsPromise.then(s => settings = s);
  originalSettingsPromise.then(s => originalSettings = s);
  let initialized = false;
  Promise.all([settingsPromise, originalSettingsPromise]).then(() => initialized = true);

  // `commands` API is currently not supported by Gecko for Android.
  const commandsPromise: undefined | ReturnType<typeof browserOrChrome.commands.getAll>
    = browserOrChrome.commands?.getAll?.();

  function checkValidity(settings: PotentiallyInvalidSettings): settings is Settings {
    return formEl.checkValidity();
  }
  const keysEverUpdatedByThisScript = new Set<keyof Settings>();
  function saveSettings() {
    assertDev(checkValidity(settings), 'Expected saveSettings to be called only when the form is valid');
    const updatedValues: Partial<Settings> = {};
    // A stupid way to only write the settings that we did change. TODO just rewrite settings communication with
    // message passing already. Or at least do it as we do in `content/App.svelte'.
    for (const [key_, value] of Object.entries(settings)) {
      const key = key_ as keyof typeof settings;
      // Why can't just do `isEqual`? Because then if we did change a setting and then changed it back,
      // only the first change would get saved.
      if (!keysEverUpdatedByThisScript.has(key)) {
        if (isEqual(originalSettings[key], value)) {
          continue;
        }
        keysEverUpdatedByThisScript.add(key);
      }
      updatedValues[key] = value;
    }
    setSettings(updatedValues);
    unsaved = false;
  }
  const debouncedSaveSettings = debounce(saveSettings, 50);

  function onResetToDefaultsClick() {
    // TODO looks like `confirm()` doesn't work. Let's create our own `<dialog>`?
    settings = cloneDeepJson(defaultSettings); // This will trigger the `onSettingsChanged` listener.
  }

  async function onSettingsChanged() {
    if (!initialized) {
      return;
    }

    debouncedSaveSettings.cancel();
    unsaved = true;
    // Settings change might have changed the form DOM (e.g. added a new key binding), need to wait for it to update
    // before using it.
    await tick();
    formValid = formEl.checkValidity();

    if (formValid) {
      debouncedSaveSettings();
    }
  }
  $: { settings; onSettingsChanged(); }
  // TODO how about we also restore the invalid state when the options page is loaded again?
  // Also, see https://developers.google.com/web/updates/2017/03/dialogs-policy#alternatives. They suggest using
  // `onvisibilitychange` instead.
  window.addEventListener('beforeunload', e => {
    if (formEl.checkValidity()) {
      debouncedSaveSettings.flush();
    } else {
      // TODO Y u no working? Bug? If we change `options_ui.open_in_tab` to `true` in manifest.json, it does work.
      e.preventDefault(); e.returnValue = ''; return ''; // Some polyfilling right here.
    }
  });

  const onPlaybackRateChangeFromOtherScriptsOptions:
    Array<{ v: Settings['onPlaybackRateChangeFromOtherScripts'], l: string }>
    = [
      { v: 'updateSoundedSpeed', l: `= ${getMessage('updateSoundedSpeedWheneverItChangesOnWebsite')}` },
      { v: 'prevent', l: `✋ ${getMessage('preventOtherScriptsFromChangingPlaybackRate')}` },
      { v: 'doNothing', l: `🧘 ${getMessage('doNothingWheneverPlaybackRateChanges')}` },
    ];
  const silenceSpeedSpecificationMethodOptions: Array<{ v: Settings['silenceSpeedSpecificationMethod'], l: string }> = [
    { v: 'relativeToSoundedSpeed', l: `✖️ ${getMessage('relativeToSounded')}` },
    { v: 'absolute', l: `= ${getMessage('absolute')}${getMessage('absoluteSilenceSpeedClarification')}` },
  ]
  const badgeWhatSettingToDisplayByDefaultOptions: Array<{ v: Settings['badgeWhatSettingToDisplayByDefault'], l: string }> = [
    { v: 'none', l: `❌ ${getMessage('none')}`, },
    { v: 'soundedSpeed', l: `🗣️▶️ ${getMessage('soundedSpeed')}`, },
    { v: 'silenceSpeedRaw', l: `🙊⏩ ${getMessage('silenceSpeed')}`, },
    { v: 'volumeThreshold', l: `🔉🎚️ ${getMessage('volumeThreshold')}`, },
  ]
  const timeSavedAveragingMethodOptions: Array<{ v: Settings['timeSavedAveragingMethod'], l : string }> = [
    { v: 'all-time', l: `♾️ ${getMessage('timeSavedAveragingMethodAllTime')}` },
    { v: 'exponential', l: `📉 ${getMessage('timeSavedAveragingMethodExponential')}`, },
  ];
  const popupChartSpeedOptions: Array<{ v: Settings['popupChartSpeed'], l: string }> = [
    { v: 'intrinsicTime', l: `▶️= ${getMessage('chartSpeedIntrinsicTime')}` },
    { v: 'soundedSpeedTime', l: `▶️➗ ${getMessage('chartSpeedSoundedSpeedTime')}` },
    { v: 'realTime', l: `🌎 ${getMessage('chartSpeedRealTime')}` },
  ];

  const rangeInputSettingsNamesCapitalized = [
    { v: 'VolumeThreshold', l: `🔉🎚️ ${getMessage('volumeThreshold')}`, },
    { v: 'SoundedSpeed', l: `🗣️▶️ ${getMessage('soundedSpeed')}`, },
    { v: 'SilenceSpeedRaw', l: `🙊⏩ ${getMessage('silenceSpeed')}`, },
    { v: 'MarginBefore', l: `⏱️⬅️ ${getMessage('marginBefore')}`, },
    { v: 'MarginAfter', l: `⏱️➡️ ${getMessage('marginAfter')}`, },
  ] as const;
  const rangeInputAttrs = ['Min', 'Step', 'Max'] as const;

  // TODO add `rel` attribute to the link element?
  let editNativeShortcutsLinkUrl: string;
  switch (BUILD_DEFINITIONS.BROWSER) {
    case 'chromium':
      // From https://developer.chrome.com/apps/commands#usage
      editNativeShortcutsLinkUrl = 'chrome://extensions/configureCommands';
      break;
    case 'gecko':
      // Yes, it's a knowledge base page, because Firefox doesn't have a dedicated link for the "manage shortcuts" page.
      // TODO change it when it does.
      // Also it there is this method: `browser.commands.update`, but I think native the dedicated page is better.
      editNativeShortcutsLinkUrl = 'https://support.mozilla.org/kb/manage-extension-shortcuts-firefox';
      break;
    default: assertNever(BUILD_DEFINITIONS.BROWSER);
  }

  // Yes, these don't take migartions into account at all. TODO.
  async function downloadFromSync() {
    Object.assign(settings, await browserOrChrome.storage.sync.get() as Partial<Settings>);
    settings = settings;
  }
  async function uploadToSync() {
    assertDev(checkValidity(settings));
    browserOrChrome.storage.sync.clear();
    browserOrChrome.storage.sync.set(filterOutLocalStorageOnlySettings(settings));
  }

  const snowflakeExtensionUrl = BUILD_DEFINITIONS.BROWSER === 'gecko'
    ? 'https://addons.mozilla.org/firefox/addon/torproject-snowflake/'
    : 'https://chrome.google.com/webstore/detail/snowflake/mafpmfcccpbjnhfhjnllmmalhifmlcie';

  let contactEmailHref: string | null = BUILD_DEFINITIONS.CONTACT_EMAIL
    ? `mailto:${BUILD_DEFINITIONS.CONTACT_EMAIL}`
    : null;
  ((async () => {
    if (!BUILD_DEFINITIONS.CONTACT_EMAIL) {
      return null;
    }

    const params = new URLSearchParams({
      subject: 'Jump Cutter',
      // TODO improvement: i18n?
      body: `Debug info (you can remove this):`
        + `\nJump Cutter version: ${browserOrChrome.runtime.getManifest().version}`
        + `\nLanguage: ${browserOrChrome.i18n.getUILanguage()}`
        + `\nSystem info: ${navigator.userAgent}`
        + `\nJump Cutter settings:`
        + '\n\n```json'
        // Why `filterSettings`? Because if the URL gets too long,
        // the app might not open it properly.
        + `\n${JSON.stringify(filterSettings(await originalSettingsPromise), undefined, 2)}`
        + '\n```'
    });

    function filterSettings(settings: Settings): Partial<Settings> {
      const includeSettings: Array<keyof Settings> = [
        'enabled',
        'volumeThreshold',
        'experimentalControllerType',
        'soundedSpeed',
        'silenceSpeedRaw',
        'silenceSpeedSpecificationMethod',
        'marginBefore',
        'marginAfter',
        'enableDesyncCorrection',
        'onPlaybackRateChangeFromOtherScripts',
      ]
      return Object.fromEntries(
        includeSettings.map(key => [key, settings[key]])
      )
    }

    return `mailto:${BUILD_DEFINITIONS.CONTACT_EMAIL}?${params.toString()}`
  })())
    .then(href => contactEmailHref = href)
</script>

<main>
  {#await settingsPromise then _}
  {#if initialized}
    <form
      bind:this={formEl}
      on:submit|preventDefault={saveSettings}
    >
      <section>
        <h3>{getMessage('general')}</h3>
        <fieldset>
          <legend>▶️👀 {getMessage('wheneverPlaybackRateChangesFromOtherScripts')}</legend>
          {#each onPlaybackRateChangeFromOtherScriptsOptions as { v, l }}
            <input
              type="radio"
              name="onPlaybackRateChangeFromOtherScripts"
              value={v}
              bind:group={settings.onPlaybackRateChangeFromOtherScripts}
              id={`onPlaybackRateChangeFromOtherScripts-radio-${v}`}
            />
            <label
              for={`onPlaybackRateChangeFromOtherScripts-radio-${v}`}
            >{l}</label>
            <br>
          {/each}
        </fieldset>
        <InputFieldBase
          label="{getMessage('applyTo')}"
          let:id
        >
          <select
            {id}
            bind:value={settings.applyTo}
            required
          >
            {#each [
              { v: 'videoOnly', l: `🎥 ${getMessage('applyToOnly', getMessage('video'))}` },
              { v: 'audioOnly', l: `🔉 ${getMessage('applyToOnly', getMessage('audio'))}` },
              { v: 'both', l: `🎥&🔉 ${getMessage('applyToBoth')}` },
            ] as { v, l }}
              <option value={v}>{l}</option>
            {/each}
          </select>
        </InputFieldBase>
        <CheckboxField
          label="🔇❌ {getMessage('omitMutedElements')}"
          bind:checked={settings.omitMutedElements}
        />
        <InputFieldBase
          label="🙊= {getMessage('silenceSpeedSpecificationMethod')}"
          let:id
        >
          <select
            {id}
            bind:value={settings.silenceSpeedSpecificationMethod}
            required
          >
            {#each silenceSpeedSpecificationMethodOptions as { v, l }}
              <option value={v}>{l}</option>
            {/each}
          </select>
        </InputFieldBase>
        {#if browserHasAudioDesyncBug}
          <!-- When `browserHasAudioDesyncBug === false`, the value
          of this setting has no effect, so there is no point in showing it -->
          <CheckboxField
            label="👫 {getMessage('enableDesyncCorrection')}"
            bind:checked={settings.enableDesyncCorrection}
          />
        {/if}
        <!-- The English `useSeparateMarginSettingsForDifferentAlgorithms`
        no longer uses `marginBefore` and `marginAfter` substitutions,
        but some languages still do, so we need to keep all 3 substitutions
        until that changes. -->
        <CheckboxField
          label="🔄 {getMessage('useSeparateMarginSettingsForDifferentAlgorithms', [
            getMessage('marginBefore'),
            getMessage('marginAfter'),
            getMessage('useExperimentalAlgorithm'),
          ])}"
          bind:checked={settings.useSeparateMarginSettingsForDifferentAlgorithms}
        />
      </section>
      <section>
        <h3>{getMessage('hotkeys')}</h3>
        <CheckboxField
          label="⌨️ {getMessage('enableHotkeys')}"
          bind:checked={settings.enableHotkeys}
        />
        <!-- TODO how about we hide the table entirely? But keep in mind that it would make it possible to save
        invalid settings as the table inputs would stop being validated. Consider replacing it with
        `<fieldset disabled={...}`. and rewriting saving logic so that `saveSettings` is called on form submit
        and new values are constructed from FormData (so disabled fields are ignored and don't have effect on the
        settings). This would require us to provide inputs with names though.
        https://developer.mozilla.org/en-US/docs/Web/API/FormData/Using_FormData_Objects#Retrieving_a_FormData_object_from_an_HTML_form. -->
        <div style={settings.enableHotkeys ? '' : 'opacity: 0.5;'}>
          <ul>
            <!-- TODO do we need "Hotkeys are also active when the popup is open" here (see localization)?
            Maybe it can be understood from inputs' labels? -->
            {#each getMessage('hotkeysNotes', getMessage('switch')).split('\n') as line}
              <li>{line}</li>
            {/each}
          </ul>
          <HotkeysTable
            bind:hotkeys={settings.hotkeys}
            displayOverrideWebsiteHotkeysColumn={true}
            style="margin: 0.75rem 0;"
          >
            <!-- AFAIK There's no way to open popup programatically, so we use native commands for that.
            TODO refactor: move this comment to `manifest.json` somehow? -->
            {#if commandsPromise}
            {#await commandsPromise then commands}
              {#each commands as command}
                <tr>
                  <!-- _execute_page_action is unhandled. Though we don't use it. -->
                  <td>{command.name === '_execute_action' ? getMessage('openPopup') : command.description}</td>
                  <td>
                    <input
                      disabled
                      readonly
                      value={command.shortcut}
                      style="width: calc(100% - 5ch)"
                    />
                    <!-- Shortcuts page opening method was looked up in the Dark Reader extension. Though it appeared
                    to not work fully (no scrolling to anchor). Just 'href' doesn't work. -->
                    <a
                      href={editNativeShortcutsLinkUrl}
                      on:click|preventDefault={_ => browserOrChrome.tabs.create({
                        url: editNativeShortcutsLinkUrl,
                        active: true,
                      })}
                      aria-label="{getMessage('edit')}"
                      style="text-decoration: none; padding: 0.125rem;"
                    >✏️</a>
                  </td>
                  <td></td> <!-- No argument -->
                  <td></td> <!-- No "overrideWebsiteHotkeys" -->
                  <td></td> <!-- No "delete" -->
                </tr>
              {/each}
            {/await}
            {/if}
          </HotkeysTable>
        </div>
      </section>
      <section>
        <h3>{getMessage('popup')}</h3>
        <section>
          <h4><!-- 📈 -->{getMessage('chart')}</h4>
          <NumberField
            label="⏱️ {getMessage('chartLengthInSeconds')}"
            bind:value={settings.popupChartLengthInSeconds}
            required
            min="0"
          />
          <NumberField
            label="⏱️ {getMessage('chartJumpPeriod')}"
            bind:value={settings.popupChartJumpPeriod}
            required
            min="0"
            max="100"
          />
          <NumberField
            label="📏 {getMessage('chartWidthPx')}"
            bind:value={settings.popupChartWidthPx}
            required
            min="0"
          />
          <NumberField
            label="📏 {getMessage('chartHeightPx')}"
            bind:value={settings.popupChartHeightPx}
            required
            min="0"
          />
          <!-- ▶️ -->
          <InputFieldBase
            label="🚶 {getMessage('chartSpeed')}"
            let:id
          >
            <select
              {id}
              bind:value={settings.popupChartSpeed}
            >
              {#each popupChartSpeedOptions as { v, l }}
                <option value={v}>{l}</option>
              {/each}
            </select>
          </InputFieldBase>
        </section>
        <section>
          <h4>{getMessage('rangeSlidersAttributes')}</h4>
          <p>{getMessage('rangeSlidersAttributesNote')}</p>
          <div style="overflow-x: auto;">
            <table style="margin: 0.75rem 0;">
              <thead>
                <th>{getMessage('input')}</th>
                {#each [
                  getMessage('min'),
                  getMessage('step'),
                  getMessage('max'),
                ] as l}
                  <th>{l}</th>
                {/each}
              </thead>
              <tbody>
                {#each rangeInputSettingsNamesCapitalized as rangeInputSettingNameCapitalized}
                  <tr>
                    <td>{rangeInputSettingNameCapitalized.l}</td>
                    {#each rangeInputAttrs as attr}
                      <td>
                        <!-- TODO is the way we handle 'Step' ok? Maybe we should just convert 0 to `"any"`?
                        Or use a checkbox that sets it to "any"? -->
                        <input
                          style="width: 14ch"
                          type="number"
                          step="any"
                          min={attr === 'Step' ? Number.MIN_VALUE : ''}
                          bind:value={settings[`popup${rangeInputSettingNameCapitalized.v}${attr}`]}
                        />
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>

        {#if settings.enableHotkeys} <!-- TODO Are you sure this needs to be hidden? -->
          <CheckboxField
            label="⌨️🚫 {getMessage('disableHotkeysWhileInputFocused')}"
            bind:checked={settings.popupDisableHotkeysWhileInputFocused}
          />
        {/if}
        <CheckboxField
          label="☑️ {getMessage('autofocusEnabledInput', getMessage('enable'))}"
          bind:checked={settings.popupAutofocusEnabledInput}
        />
        {#if settings.oppositeDayMode !== OppositeDayMode_UNDISCOVERED}
          <!-- TODO translate -->
          <CheckboxField
            label='🔀 Show the "Opposite day" checkbox'
            checked={settings.oppositeDayMode !== OppositeDayMode_HIDDEN_BY_USER}
            on:change={e => {
              assertDev(e.currentTarget instanceof HTMLInputElement);

              if (e.currentTarget.checked) {
                settings.oppositeDayMode = OppositeDayMode_OFF;
              } else {
                settings.oppositeDayMode = OppositeDayMode_HIDDEN_BY_USER;
              }
            }}
          />
        {/if}
        <CheckboxField
          label="🔗 {getMessage('alwaysShowOpenLocalFileLink', getMessage('openLocalFile'))}"
          bind:checked={settings.popupAlwaysShowOpenLocalFileLink}
        />
        <section>
          <h4>{getMessage('popupSpecificHotkeys')}</h4>
          <HotkeysTable
            bind:hotkeys={settings.popupSpecificHotkeys}
            displayOverrideWebsiteHotkeysColumn={false}
            style="margin: 0.75rem 0;"
          />
        </section>
      </section>
      <section>
        <h3>{getMessage('timeSaved')}</h3>
        <InputFieldBase
          label="⏱️🧮 {getMessage('timeSavedAveragingMethod')}"
          let:id
        >
          <select
            {id}
            bind:value={settings.timeSavedAveragingMethod}
          >
            {#each timeSavedAveragingMethodOptions as { v, l }}
              <option value={v}>{l}</option>
            {/each}
          </select>
        </InputFieldBase>
        {#if settings.timeSavedAveragingMethod === 'exponential'}
          <NumberField
            label="⏱️✂️ {getMessage('timeSavedAveragingWindowLength')}"
            bind:value={settings.timeSavedAveragingWindowLength}
            required
            min="1e-3"
          />
          <!-- TODO this is a pretty advanced setting. Hide it? -->
          <!-- Allowing 0 and 1 because they're technically valid (but not sound though). TODO? -->
          <!-- TODO represent it in percents. -->
          <NumberField
            label="⏱️✂️⚖️ {getMessage('timeSavedExponentialAveragingLatestDataWeight')}"
            bind:value={settings.timeSavedExponentialAveragingLatestDataWeight}
            required
            min="1e-9"
            max={1 - 1e-9}
          />
          <!-- TODO hh:mm:ss? -->
          <!-- TODO explain math? -->
          <p>
            <output>{
              getMessage(
                'timeSavedDataWeightDecayTimeConstant',
                (getTimeSavedDataWeightDecayTimeConstant(
                  settings.timeSavedExponentialAveragingLatestDataWeight,
                  settings.timeSavedAveragingWindowLength
                ) * Math.LN2).toPrecision(5)
              )
            }</output>
          </p>
        {/if}
      </section>
      <section>
        <h3>{getMessage('iconBadge')}</h3>
        <InputFieldBase
          label="{getMessage('badgeWhatSettingToDisplayByDefault')}"
          let:id
        >
          <select
            {id}
            bind:value={settings.badgeWhatSettingToDisplayByDefault}
            required
          >
            {#each badgeWhatSettingToDisplayByDefaultOptions as { v, l }}
              <option value={v}>{l}</option>
            {/each}
          </select>
        </InputFieldBase>
      </section>

      <section>
        <h3>{getMessage('meta')}</h3>
        <!-- TODO add confirmation dialogs or cancellation toasts and remove `style="color: red;"`? -->
        <button
          type="button"
          style="color: red;"
          on:click={downloadFromSync}
        >📥 {getMessage('downloadFromSync')}</button>
        <br/><br/>
        <button
          type="button"
          disabled={!formValid}
          on:click={uploadToSync}
        >📤 {getMessage('uploadToSync')}</button>
        <br/><br/>
        <button
          type="button"
          style="color: red;"
          on:click={onResetToDefaultsClick}
        >🔄 {getMessage('resetToDefaults')}</button>
        <br/><br/>
        <!-- TODO: -->
        <!-- <button
          type="button"
          style="color: red;"
        >Cancel latest changes (or "restore values from 2 minutes ago"?) Or is it just confusing?</button> -->
        <!-- <button
          type="button"
        >Export settings...</button>
        <button
          type="button"
        >Import settings...</button> -->

      <!-- As we're auto-saving changes, this could be omited, but this is so users can trigger form validation on
      "Enter" press. And maybe some other cool native things. -->
      <input
        type="submit"
        style="display: none;"
      />
    </form>
  {/if}
  {/await}
  {#if contactEmailHref}
    <div style="margin: 1rem 0;">
      <a
        target="_blank"
        href={contactEmailHref}
        rel="extenral noopener noreferrer"
      >📧 {getMessage('contact')}</a>
    </div>
  {/if}
  <div style="margin: 1rem 0;">
    <a
      target="_blank"
      href="https://matrix.to/#/#jump-cutter-extension:matrix.org"
      rel="extenral noopener noreferrer"
    >💬 {getMessage('chat')}</a>
  </div>
  <div style="margin: 1rem 0;">
    <a
      target="_blank"
      href="https://hosted.weblate.org/engage/jump-cutter/"
      rel="extenral noopener noreferrer"
    >🌐 {getMessage('helpTranslate')}</a>
  </div>
  <div style="margin: 1rem 0;">
    <a
      target="_blank"
      href="https://antiwarcommittee.info/en/sunrise/#help"
      rel="extenral noopener noreferrer"
    >💸 {getMessage('donate')}</a>
  </div>
  <!-- Maybe it makes sense to hide the link in places where Tor is censored, but we don't have a good way
  to detect it. `i18n.getUILanguage()` is an option, but there may be people speaking the country's language
  but living somewhere else (e.g. immigrants), and they're expected to be more eager to follow such advice. -->
  <div style="margin: 1rem 0;">
    <!-- 🤝🌐💕🧅🖇🦮 -->
    <a
      target="_blank"
      href={snowflakeExtensionUrl}
      rel="extenral noopener noreferrer"
    >🤝 {getMessage('runSnowflakeBridge')}</a>
  </div>
  <!-- TODO make all this look better. What is this? "about" AND "license"? -->
  <div style="margin: 1rem 0;">
    <a
      target="_blank"
      href="{browserOrChrome.runtime.getURL('/license.html')}"
    >⚖️ {getMessage('license')}</a>
  </div>
  <div style="margin: 1rem 0;">
    <a
      target="_blank"
      href="https://github.com/WofWca/jumpcutter"
      rel="extenral noopener noreferrer"
    >ℹ️ {getMessage('about')}</a>
  </div>
</main>
<footer>
  <a
    target="_blank"
    href="{browserOrChrome.runtime.getURL('/license.html')}"
  >
    <img src="/agplv3-with-text-162x68.png" alt="AGPLv3 Logo">
  </a>
</footer>
<!-- I've seen this design (bottom status bar) in some desktop applications (e.g. KeePassXC, if you go to settings).
However, in Gecko the whole page is stretched, so the scroll is outside of the document, so it's the same as with
`position: static;` TODO? -->
<div class="status-bar">
  <!-- `min-height` just so its height doesn't change when "Show errors" text appears (because its button is
  pretty tall. TODO this can be removed when the button is gone). -->
  <p style="min-height: 2rem; opacity: 0.8; display: flex; margin: 0; align-items: center;">
    <!-- TODO doesn't this annoy users by constantly blinking? -->
    {#if unsaved}
      {#if formValid}
        <!-- TODO how about we get rid of this message at all (when the `beforeunload`) starts working so
        users don't have to sit there and wait for this to turn to "Saved" after making changes? Or, perhaps, the
        debounce duration isn't big enough to worry and just makes it more satisfying to see it get saved so
        quickly? -->
        <span>⏳ {getMessage('saving')}</span>
      {:else}
        <span>
          <span style="color: red;">⚠️ {getMessage('hasErrors')}</span>
          <button
            type="button"
            on:click={_ => formEl.reportValidity()}
          >{getMessage('showErrors')}</button>
        </span>
      {/if}
    {:else}
      <span class="saved-text">✔️ {getMessage('saved')}</span>
    {/if}
  </p>
</div>

<style>
:global(body) {
  margin: 0;
  --main-padding: 1rem;
  --content-max-width: 48rem;
}
main {
  padding: 0 var(--main-padding);

  max-width: var(--content-max-width);
  margin-right: auto;
  margin-left: auto;
  /* Needed for Firefox, by deafult it renders the settings page with a serif font */
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
footer {
  padding: 0 var(--main-padding);

  /* To account for the status bar. */
  padding-bottom: 40px;

  text-align: end;

  max-width: var(--content-max-width);
  margin: 3rem auto 1rem auto;
}
section {
  background: #88888814;
  margin: 1rem 0;
  padding: 0 0.625rem;
  border: 1px solid gray;
  border-radius: 0.25rem;
}
h1, h2, h3, h4, h5, h6 {
  margin: 0.625rem 0;
}
.status-bar {
  /* `sticky` sounds tempting, but on mobile it behaves weird,
  it gets in the middle of the screen.
  See https://github.com/WofWca/jumpcutter/pull/191 */
  position: fixed;

  bottom: 0;
  width: 100%;
  padding: 0.125rem var(--main-padding);
  background-color: white;
  border-top: 1px solid gray;
}
.saved-text {
  color: green;
}
@media (prefers-color-scheme: dark) {
  .status-bar {
    /* IDK, `background-color: inherit` doesn't make it dark with the dark theme with default colors. */
    background: #111;
    color: #ddd;
  }
  .saved-text {
    color: lightgreen;
  }
}
</style>
