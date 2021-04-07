<script lang="ts">
  import browser from '@/webextensions-api';
  import { tick } from 'svelte';
  import HotkeysTable, { PotentiallyInvalidHotkeyBinding } from './components/HotkeysTable.svelte';
  import CheckboxField from './components/CheckboxField.svelte';
  import NumberField from './components/NumberField.svelte';
  import InputFieldBase from './components/InputFieldBase.svelte';
  import { cloneDeepJson, assert, assertNever } from '@/helpers';
  import { defaultSettings, getSettings, setSettings, Settings } from '@/settings';
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
    assert(checkValidity(settings), 'Expected saveSettings to be called only when the form is valid');
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
    { v: 'absolute', l: '= Absolute' },
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
</script>

<div
  class="app"
  style={BUILD_DEFINITIONS.BROWSER === 'gecko' ? 'margin: 1rem;' : ''}
>
  {#await settingsPromise then _}
    <form
      bind:this={formEl}
      on:submit|preventDefault={saveSettings}
    >
      <section>
        <h3>General</h3>
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
        <!-- TODO I'm afraid the part in brackets may make users think that disabling this will make all the bad things
        about the extension go away. -->
        <CheckboxField
          label="👫 Enable audio-video desynchronization correction (side effect: for the most part unnoticeable stutter every minute or so)"
          bind:checked={settings.enableDesyncCorrection}
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

      <!-- `min-height` just so its height doesn't change when "Show errors" text appears (because its button is 
      pretty tall. TODO this can be removed when the button is gone). -->
      <p style="min-height: 2rem; opacity: 0.8; margin: 2rem 0; display: flex; align-items: center;">
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
          <span style="color: green;">✔️ Saved</span>
        {/if}
      </p>
      <!-- As we're auto-saving changes, this could be omited, but this is so users can trigger form validation on
      "Enter" press. And maybe some other cool native things. -->
      <input
        type="submit"
        style="display: none;"
      />
    </form>
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
  {/await}
  <div style="margin-top: 1rem;">
    <a
      target="new"
      href="https://github.com/WofWca/jumpcutter"
    >ℹ️ About</a>
  </div>
</div>
