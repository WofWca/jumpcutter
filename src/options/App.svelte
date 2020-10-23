<script lang="ts">
  import { tick } from 'svelte';
  import CustomValueInput from './CustomValueInput.svelte';
  import { cloneDeepJson, assert } from '@/helpers';
  import { defaultSettings, getSettings, setSettings, Settings } from '@/settings';
  import {
    eventToCombination, combinationToString, HotkeyBinding, hotkeyActionToString, KeyCombination
  } from '@/hotkeys';
  import { debounce } from 'lodash';

  let unsaved = false;
  let formValid = true;
  let formEl: HTMLFormElement;
  let recordKeyCombinationDialogEl: HTMLDialogElement;
  // let recordKeyCombinationDialogInput: HTMLInputElement;
  let recordingKeyCombinationForBindingInd: number | null = null;
  let recordedKeyCombination: KeyCombination | null = null;

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
  function enterEditKeyCombinationMode(bindingInd: number) {
    recordingKeyCombinationForBindingInd = bindingInd;
    recordKeyCombinationDialogEl.showModal();
  }
  async function onCombinationInputKeydown(event: KeyboardEvent) {
    const combination = eventToCombination(event);
    // // TODO maybe instead of checking for what key exacty was pressed we could check if the dialog is still open.
    // if (['Enter', 'Esc'].includes(combination.code) && (combination.modifiers ?? []).length === 0) {


    // Unfortunately, I'm not a huge expert in the event loop and things related to it. This is to wait for the dialog
    // to react to changes, and get closed, if it needs to.
    await tick();
    await new Promise(r => setTimeout(r));
    if (!recordKeyCombinationDialogEl.open) {



      // In this case the dialog will get closed, which indicates (probably) that the user is done recording.
      // TODO but this restrains us from using "Enter" and "Esc" as a hotkey.
      return;
    }
    recordedKeyCombination = combination;
  }
  function onKeyCombinationDialogSubmit() {
    // assert(!!recordedKeyCombination);

    if (!recordedKeyCombination) {
      // For when "Enter" is pressed on an empty input.
      return;
    }

    assert(recordingKeyCombinationForBindingInd !== null);
    settings.hotkeys[recordingKeyCombinationForBindingInd].keyCombination = recordedKeyCombination;
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
          <p>Modifier keys (Ctrl, Shift, etc.) are supported.<br>Several actions can be bound to a single key. This can be utilized to create "profiles".</p>
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
                  <td><div
                    style="display: flex; align-items: stretch;"
                  >
                    <!-- <input
                      readonly
                      required
                      value={binding.keyCombination ? combinationToString(binding.keyCombination) : ''}
                      on:keydown={e => onCombinationInputKeydown(bindingInd, e)}
                    /> -->

                    <!-- TODO might need to improve accessibility here. E.g. when validity is reported, the input is
                    focused, but not the "Edit" button. Somehow combine them into a single input-button, kind of like
                    <select>?
                    Recording hotkeys right in this input is worse though, because when the user "Tab"s over it, tab
                    would get recorded. -->
                    <CustomValueInput
                      on:input={_ => enterEditKeyCombinationMode(bindingInd)}
                      required
                      tabindex="-1"
                      value={binding.keyCombination ? combinationToString(binding.keyCombination) : ''}
                      style="border-right: none; border-radius: 2px 0 0 2px;"
                    />
                    <!-- The `margin:` hack – it's so we don't have to remove the borders entirely as they light up
                    when the button is in focus. -->
                    <button
                      on:click={_ => enterEditKeyCombinationMode(bindingInd)}
                      type="button"
                      id="edit-custom-key-combination-button-{bindingInd}"
                      style="min-width: unset; padding: 0.25rem; margin: 0; border-radius: 0px 2px 2px 0;"
                    >✏️</button>
                  </div></td>
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
                <!-- <dialog on:keydown={e => onCombinationInputKeydown(e)}> -->
          <dialog
            bind:this={recordKeyCombinationDialogEl}
            on:close={_ => {
              recordedKeyCombination = null;
              // Focus the button that caused the popup to open. Otherwise focus would be shifted to where the dialog
              // element is in the DOM. https://github.com/w3c/html/issues/773#issuecomment-276060898
              document.getElementById(`edit-custom-key-combination-button-${recordingKeyCombinationForBindingInd}`)
                ?.focus();
            }}
          >
            <form
              method="dialog"
              on:submit={onKeyCombinationDialogSubmit}
            >
              <!-- https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element:attr-fe-autofocus -->
                    <!-- bind:this={recordKeyCombinationDialogInput} -->
              <p>Enter the combination, then press "Enter". "Esc" to cancel.</p>

                <!-- readonly -->
              <!-- <input
                required
                autofocus
                value={recordedKeyCombination ? combinationToString(recordedKeyCombination) : ''}
                on:change={_ => recordedKeyCombination = recordedKeyCombination}
                on:keydown={e => onCombinationInputKeydown(e)}
                style="width: 100%;"
              /> -->
              <CustomValueInput
                autofocus
                value={recordedKeyCombination ? combinationToString(recordedKeyCombination) : ''}
                on:keydown={e => onCombinationInputKeydown(e)}
                style="width: 100%;"
              />

              <!-- This input will get triggered when the user presses "Enter". TODO gotta make sure that the fact that
              it still works even though it has `display: none;` is conventional.-->
              <input
                type="submit"
                style="display: none;"
              />
            </form>
            <button
              on:click={_ => { recordKeyCombinationDialogEl.close() }}
              type="button"
              style="color: red; margin-top: 0.25rem;"
            >Cancel</button>
          </dialog>
        </div>
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

<!-- <style>
  .edit-key-combination-button {
    min-width: unset;
    padding: 0.25rem;
  }
</style> -->
