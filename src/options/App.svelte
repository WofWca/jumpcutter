<script lang="ts">
  import browser from '@/webextensions-api';
  import { tick } from 'svelte';
  import HotkeysTable, { PotentiallyInvalidHotkeyBinding } from './components/HotkeysTable.svelte';
  import CheckboxField from './components/CheckboxField.svelte';
  import NumberField from './components/NumberField.svelte';
  import InputFieldBase from './components/InputFieldBase.svelte';
  import { cloneDeepJson, assertDev, assertNever } from '@/helpers';
  import { defaultSettings, filterOutLocalStorageOnlySettings, getSettings, setSettings, Settings } from '@/settings';
  import debounce from 'lodash/debounce';
  import { getDecayTimeConstant as getTimeSavedDataWeightDecayTimeConstant } from '@/content/TimeSavedTracker';

  let unsaved = false;
  let formValid = true;
  let formEl: HTMLFormElement;

  type PotentiallyInvalidSettingsChangedKeys = keyof Pick<Settings, 'hotkeys' | 'popupSpecificHotkeys'>;
  type PotentiallyInvalidSettings = Omit<Settings, PotentiallyInvalidSettingsChangedKeys> & {
    hotkeys: PotentiallyInvalidHotkeyBinding[];
    popupSpecificHotkeys: PotentiallyInvalidHotkeyBinding[];
  }
  let settings: PotentiallyInvalidSettings;
  const settingsPromise = getSettings();
  settingsPromise.then(s => settings = s);
  const commandsPromise = browser.commands.getAll();

  function checkValidity(settings: PotentiallyInvalidSettings): settings is Settings {
    return formEl.checkValidity();
  }
  function saveSettings() {
    assertDev(checkValidity(settings), 'Expected saveSettings to be called only when the form is valid');
    setSettings(settings);
    unsaved = false;
  }
  const debouncedSaveSettings = debounce(saveSettings, 50);

  function onResetToDefaultsClick() {
    // TODO looks like `confirm()` doesn't work. Let's create our own `<dialog>`?
    settings = cloneDeepJson(defaultSettings); // This will trigger the `onSettingsChanged` listener.
  }

  let watchChanges = false;
  async function onSettingsChanged() {
    // A pretty stupid way to not trigger on changed logic until settings have been loaded. Am I even supposed to use
    // Svelte's reactiviry like this.
    if (!watchChanges) {
      if (!!settings) {
        watchChanges = true;
      }
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

  const silenceSpeedSpecificationMethodOptions: Array<{ v: Settings['silenceSpeedSpecificationMethod'], l: string }> = [
    { v: 'relativeToSoundedSpeed', l: '✖️ Relative to sounded speed' },
    { v: 'absolute', l: '= Absolute (a.k.a. relative to intrinsic media speed)' },
  ]
  const badgeWhatSettingToDisplayByDefaultOptions: Array<{ v: Settings['badgeWhatSettingToDisplayByDefault'], l: string }> = [
    { v: 'none', l: '❌ None', },
    { v: 'soundedSpeed', l: '🗣️▶️ Sounded speed', },
    { v: 'silenceSpeedRaw', l: '🙊⏩ Silence speed', },
    { v: 'volumeThreshold', l: '🔉🎚️ Volume threshold', },
  ]
  const timeSavedAveragingMethodOptions: Array<{ v: Settings['timeSavedAveragingMethod'], l : string }> = [
    { v: 'all-time', l: '♾️ All-time average (no decay)' },
    { v: 'exponential', l: '📉 Only take into account the latest data (exponential decay)', },
  ];
  const popupChartSpeedOptions: Array<{ v: Settings['popupChartSpeed'], l: string }> = [
    { v: 'intrinsicTime', l: '▶️ Same as the video speed'},
    { v: 'realTime', l: '🌎 Constant (real-time)'},
  ];

  const rangeInputSettingsNamesCapitalized = [
    // TODO DRY settings labels. Maybe when we get to implementing localization.
    { v: 'VolumeThreshold', l: '🔉🎚️ Volume threshold', },
    { v: 'SoundedSpeed', l: '🗣️▶️ Sounded speed', },
    { v: 'SilenceSpeedRaw', l: '🙊⏩ Silence speed', },
    { v: 'MarginBefore', l: '⏱️⬅️ Margin before (s)', },
    { v: 'MarginAfter', l: '⏱️➡️ Margin after (s)', },
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
    Object.assign(settings, await browser.storage.sync.get() as Partial<Settings>);
    settings = settings;
  }
  async function uploadToSync() {
    assertDev(checkValidity(settings));
    browser.storage.sync.clear();
    browser.storage.sync.set(filterOutLocalStorageOnlySettings(settings));
  }
</script>

<main>
  {#await settingsPromise then _}
    <form
      bind:this={formEl}
      on:submit|preventDefault={saveSettings}
    >
      <section>
        <h3>General</h3>
        <InputFieldBase
          label="Apply to"
          let:id
        >
          <select
            {id}
            bind:value={settings.applyTo}
            required
          >
            {#each [
              { v: 'videoOnly', l: '🎥 Video elements only' },
              { v: 'audioOnly', l: '🔉 Audio elements only' },
              { v: 'both', l: '🎥&🔉 Both video & audio elements' },
            ] as { v, l }}
              <option value={v}>{l}</option>
            {/each}
          </select>
        </InputFieldBase>
        <InputFieldBase
          label="🙊= Silence speed specification method"
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
        {#if BUILD_DEFINITIONS.BROWSER === 'chromium'}
          <!-- TODO should we state that the desync problem is not present in Gecko, for the people who are using the
          both versions? -->
          <!-- TODO I'm afraid the part in brackets may make users think that disabling this will make all the bad things
          about the extension go away. -->
          <CheckboxField
            label="👫 Enable audio-video desynchronization correction (side effect: for the most part unnoticeable stutter every minute or so)"
            bind:checked={settings.enableDesyncCorrection}
          />
        {/if}
        <CheckboxField
          label={'🔄 Use different "margin before" and "margin after" for different algorithms'
            + ' (related to the "Use experimental algorithm" setting)'}
          bind:checked={settings.useSeparateMarginSettingsForDifferentAlgorithms}
        />
      </section>
      <section>
        <h3>Hotkeys</h3>
        <CheckboxField
          label="⌨️ Enable hotkeys"
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
            <li>Modifier keys (Ctrl, Shift, etc.) are supported.</li>
            <li>Several actions can be bound to a single key. This can be utilized to create "profiles".</li>
            <li>The difference between "Toggle" and "=" (a.k.a "set") actions is that "toggle" toggles the value between the previous value and the hotkey's argument, while "set" always sets it to the argument's value.</li>
            <!-- TODO do we need this here? Maybe it can be understood from inputs' labels? -->
            <li>Hotkeys are also active when the popup is open.</li>
          </ul>
          <HotkeysTable
            bind:hotkeys={settings.hotkeys}
            displayOverrideWebsiteHotkeysColumn={true}
          >
            <!-- AFAIK There's no way to open popup programatically, so we use native commands for that.
            TODO move this comment to `manifest.json` somehow? -->
            {#await commandsPromise then commands}
              {#each commands as command}
                <tr>
                  <!-- _execute_page_action is unhandled. Though we don't use it. -->
                  <td>{command.name === '_execute_browser_action' ? 'Open popup' : command.description}</td>
                  <td>
                    <input
                      disabled
                      readonly
                      value={command.shortcut}
                    />
                  </td>
                  <td></td> <!-- No argument -->
                  <td></td> <!-- No "overrideWebsiteHotkeys" -->
                  <td style="text-align: center;">
                    <!-- Shortcuts page opening method was looked up in the Dark Reader extension. Though it appeared
                    to not work fully (no scrolling to anchor). Just 'href' doesn't work. -->
                    <a
                      href={editNativeShortcutsLinkUrl}
                      on:click|preventDefault={_ => browser.tabs.create({
                        url: editNativeShortcutsLinkUrl,
                        active: true,
                      })}
                      aria-label="Edit"
                      style="text-decoration: none; padding: 0.125rem;"
                    >✏️</a>
                  </td>
                </tr>
              {/each}
            {/await}
          </HotkeysTable>
        </div>
      </section>
      <section>
        <h3>Popup</h3>
        <NumberField
          label="📈⏱️ Chart length in seconds"
          bind:value={settings.popupChartLengthInSeconds}
          required
          min="0"
        />
        <NumberField
          label="📈📏 Chart width (px)"
          bind:value={settings.popupChartWidthPx}
          required
          min="0"
        />
        <NumberField
          label="📈📏 Chart height (px)"
          bind:value={settings.popupChartHeightPx}
          required
          min="0"
        />
        <InputFieldBase
          label="📈▶️ Chart movement speed"
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
        <h4>Range sliders' attributes</h4>
        <table>
          <thead>
            <th>Input</th>
            {#each rangeInputAttrs as attr}
              <th>{attr}</th>
            {/each}
            <!-- <th>Min</th>
            <th>Step</th>
            <th>Max</th> -->
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

        {#if settings.enableHotkeys} <!-- TODO Are you sure this needs to be hidden? -->
          <CheckboxField
            label="⌨️🚫 Disable hotkeys while an input is in focus"
            bind:checked={settings.popupDisableHotkeysWhileInputFocused}
          />
        {/if}
        <CheckboxField
          label='☑️ Autofocus the "enabled" checkbox when popup opens'
          bind:checked={settings.popupAutofocusEnabledInput}
        />
        <CheckboxField
          label='🔗 Show the "Open a local file" link'
          bind:checked={settings.popupAlwaysShowOpenLocalFileLink}
        />
        <h4>Popup-specific hotkeys</h4>
        <HotkeysTable
          bind:hotkeys={settings.popupSpecificHotkeys}
          displayOverrideWebsiteHotkeysColumn={false}
        />
      </section>
      <section>
        <h3>Time saved stats</h3>
        <InputFieldBase
          label="⏱️🧮 Averaging method"
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
            label="⏱️✂️ Only take into account the last N seconds of playback"
            bind:value={settings.timeSavedAveragingWindowLength}
            required
            min="1e-3"
          />
          <!-- TODO this is a pretty advanced setting. Hide it? -->
          <!-- Allowing 0 and 1 because they're technically valid (but not sound though). TODO? -->
          <!-- TODO represent it in percents. -->
          <NumberField
            label="⏱️✂️⚖️ Latest playback period averaging weight"
            bind:value={settings.timeSavedExponentialAveragingLatestDataWeight}
            required
            min="1e-9"
            max={1 - 1e-9}
          />
          <!-- TODO hh:mm:ss? -->
          <!-- TODO explain math? -->
          <output>Resulting data weight half-life: {
            (getTimeSavedDataWeightDecayTimeConstant(
              settings.timeSavedExponentialAveragingLatestDataWeight,
              settings.timeSavedAveragingWindowLength
            ) * Math.LN2).toPrecision(5)
          } seconds</output>
        {/if}
      </section>
      <section>
        <h3>Icon badge</h3>
        <InputFieldBase
          label="What setting value to display by default"
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
        <h3>Meta</h3>
        <!-- TODO add confirmation dialogs or cancellation toasts and remove `style="color: red;"`? -->
        <button
          type="button"
          style="color: red;"
          on:click={downloadFromSync}
        >📥 Download settings from sync storage</button>
        <br/><br/>
        <button
          type="button"
          disabled={!formValid}
          on:click={uploadToSync}
        >📤 Upload settings to sync storage</button>
        <br/><br/>
        <button
          type="button"
          style="color: red;"
          on:click={onResetToDefaultsClick}
        >🔄 Reset to defaults</button>
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
  {/await}
  <div style="margin: 1rem 0;">
    <a
      target="new"
      href="https://github.com/WofWca/jumpcutter"
    >ℹ️ About</a>
  </div>
</main>
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
        <span>⏳ Saving...</span>
      {:else}
        <span>
          <span style="color: red;">⚠️ Errors found </span>
          <button
            type="button"
            on:click={_ => formEl.reportValidity()}
            aria-label="Show errors"
          >Show</button>
        </span>
      {/if}
    {:else}
      <span class="saved-text">✔️ Saved</span>
    {/if}
  </p>
</div>

<style>
:global(body) {
  margin: 0;
  --main-margin: 1rem;
}
main {
  margin: var(--main-margin);
}
.status-bar {
  position: sticky;
  bottom: 0;
  padding: 0.125rem var(--main-margin);
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
