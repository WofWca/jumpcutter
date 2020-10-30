<script lang="ts">
  import { tick } from 'svelte';
  import CustomValueInput from './CustomValueInput.svelte';
  import { cloneDeepJson, assert } from '@/helpers';
  import { defaultSettings, getSettings, setSettings, Settings } from '@/settings';
  import { eventToCombination, combinationToString, HotkeyBinding, hotkeyActionToString } from '@/hotkeys';
  import { debounce } from 'lodash';

  let unsaved = false;
  let formValid = true;
  let formEl: HTMLFormElement;

  type PotentiallyInvalidHotkeyBinding = {
    [P in keyof HotkeyBinding]?: HotkeyBinding[P];
  }
  type PotentiallyInvalidSettingsChangedKeys = keyof Pick<Settings, 'hotkeys'>;
  type PotentiallyInvalidSettings = Omit<Settings, PotentiallyInvalidSettingsChangedKeys> & {
    hotkeys: PotentiallyInvalidHotkeyBinding[];
  }
  let settings: PotentiallyInvalidSettings;
  const settingsPromise = getSettings();
  settingsPromise.then(s => settings = s);
  type Commands = Parameters<Parameters<typeof chrome.commands.getAll>[0]>[0];
  let commands: Commands;
  const commandsPromise = new Promise<Commands>(r => chrome.commands.getAll(r));
  commandsPromise.then(c => commands = c);

  function checkValidity(settings: PotentiallyInvalidSettings): settings is Settings {
    return formEl.checkValidity();
  }
  function saveSettings() {
    assert(checkValidity(settings), 'Expected saveSettings to be called only when the form is valid');
    setSettings(settings);
    unsaved = false;
  }
  const debouncedSaveSettings = debounce(saveSettings, 50);
  function addNewBinding() {
    settings.hotkeys.push({});
    settings = settings;
  }
  function removeBinding(bindingInd: number) {
    settings.hotkeys.splice(bindingInd, 1);
    settings = settings;
  }
  async function onCombinationInputKeydown(bindingInd: number, event: KeyboardEvent) {
    // In case the user just wanted to focus another input and pressed "Tab".
    // Though if you press "Shift+Tab", "Shift" is still recorded.
    await new Promise(r => setTimeout(r)); // Not a huge event loop expert. TODO make sure it's consistent.
    if (document.activeElement !== event.target) {
      return;
    }

    const combination = eventToCombination(event);
    settings.hotkeys[bindingInd].keyCombination = combination;
    settings = settings;
  }

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
</script>

<div class="app">
  {#await settingsPromise then _}
    <form
      bind:this={formEl}
      on:submit|preventDefault={saveSettings}
    >
      <section>
        <h3>Hotkeys</h3>
        <label>
          <input
            type="checkbox"
            bind:checked={settings.enableHotkeys}
          > Enable hotkeys
        </label>
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
            <li>The difference between "Toggle" and "=" (a.k.a "set") actions is that "toggle" toggles the value between the previous 
value and the hotkey's argument, while "set" always sets it to the argument's value.</li>
            <!-- TODO do we need this here? Maybe it can be understood from inputs' labels? -->
            <li>Hotkeys are also active when the popup is open.</li>
          </ul>
          <table>
            <thead>
              <th>Action</th>
              <th>Hotkey</th>
              <th>Value</th>
            </thead>
            <tbody>
              <!-- AFAIK There's no way to open popup programatically, so we use native commands for that.
              TODO move this comment to `manifest.json` somehow? -->
              {#await commandsPromise then _}
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
                    <td style="text-align: center;">
                      <!-- Shortcuts page opening method was looked up in the Dark Reader extension. Though it appeared
                      to not work fully (no scrolling to anchor). Just 'href' doesn't work. Link is taken from
                      https://developer.chrome.com/apps/commands#usage. -->
                      <a
                        href="chrome://extensions/configureCommands"
                        on:click|preventDefault={_ => chrome.tabs.create({
                          url: 'chrome://extensions/configureCommands',
                          active: true,
                        })}
                        aria-label="Edit"
                        style="text-decoration: none; padding: 0.125rem;"
                      >✏️</a>
                    </td>
                  </tr>
                {/each}
              {/await}
              {#each settings.hotkeys as binding, bindingInd}
                <tr>
                  <td>
                    <select
                      bind:value={binding.action}
                      required
                    >
                      {#each Object.entries(hotkeyActionToString) as [id, string]}
                        <option value={id}>{string}</option>
                      {/each}
                    </select>
                  </td>
                  <td>
                    <CustomValueInput
                      required
                      value={binding.keyCombination ? combinationToString(binding.keyCombination) : ''}
                      on:keydown={e => onCombinationInputKeydown(bindingInd, e)}
                    />
                  </td>
                  <td>
                    <!-- TODO in the future, the argument isn't necessarily going to be a number, and isn't
                    necessarily going to be required at all. -->
                    <input
                      bind:value={binding.actionArgument}
                      required
                      type="number"
                      step="any"
                    >
                  </td>
                  <td>
                    <button
                      type="button"
                      on:click={e => removeBinding(bindingInd)}
                      aria-label="Remove binding"
                    >🗑️</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          <button
            type="button"
            on:click={addNewBinding}
            aria-label="Add new hotkey"
          >➕</button>
        </div>
      </section>
      <section class="advanced-section">
        <h3>Advanced</h3>
        {#if settings.enableHotkeys} <!-- TODO Are you sure this needs to be hidden? -->
          <label>
            <input
              type="checkbox"
              bind:checked={settings.popupDisableHotkeysWhileInputFocused}
            > Popup: disable hotkeys while an input is in focus
          </label>
        {/if}
        <label>
          <input
            type="checkbox"
            bind:checked={settings.popupAutofocusEnabledInput}
          > Popup: autofocus the "enabled" checkbox when popup opens
        </label>
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
    >Reset to defaults</button>
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
    >About</a>
  </div>
</div>

<style>
  .advanced-section > label {
    margin: 0.125rem 0;
    display: inline-block;
  }
</style>
