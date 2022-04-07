<script context="module" lang="ts">
  export type PotentiallyInvalidHotkeyBinding<T extends HotkeyAction = HotkeyAction> = {
    [P in keyof HotkeyBinding<T>]?: HotkeyBinding<T>[P];
  }
</script>

<script lang="ts">
  import CustomValueInput from './CustomValueInput.svelte';
  import {
    eventToCombination, combinationToString, HotkeyBinding, hotkeyActionToString, HotkeyAction, NoArgumentAction,
    allNoArgumentActions,
  } from '@/hotkeys';
  import { createGetMessage, getMessageNative } from '@/helpers';

  let getMessage = getMessageNative;
  createGetMessage().then(r => getMessage = r);

  export let hotkeys: PotentiallyInvalidHotkeyBinding[];
  export let displayOverrideWebsiteHotkeysColumn: boolean;

  function addNewBinding() {
    hotkeys.push({});
    hotkeys = hotkeys;
  }
  function removeBinding(bindingInd: number) {
    hotkeys.splice(bindingInd, 1);
    hotkeys = hotkeys;
  }
  async function onCombinationInputKeydown(bindingInd: number, event: KeyboardEvent) {
    // In case the user just wanted to focus another input and pressed "Tab".
    // Though if you press "Shift+Tab", "Shift" is still recorded.
    await new Promise(r => setTimeout(r)); // Not a huge event loop expert. TODO make sure it's consistent.
    if (document.activeElement !== event.target) {
      return;
    }

    const combination = eventToCombination(event);
    hotkeys[bindingInd].keyCombination = combination;
    hotkeys = hotkeys;
  }
  function isPotentiallyInvalidBindingWithArgument(
    binding: PotentiallyInvalidHotkeyBinding,
  ): binding is PotentiallyInvalidHotkeyBinding<Exclude<HotkeyAction, NoArgumentAction>> {
    return !!binding.action && !(allNoArgumentActions as any).includes(binding.action);
  }
</script>

<div>
  <table>
    <thead>
      <th>{getMessage('action')}</th>
      <th>{getMessage('hotkey')}</th>
      <th>{getMessage('value')}</th>
      {#if displayOverrideWebsiteHotkeysColumn}
        <th>{getMessage('overrideWebsiteHotkeys')}</th>
      {/if}
    </thead>
    <tbody>
      <!-- It would be more logical to use a named slot, but https://github.com/sveltejs/svelte/issues/1037. -->
      <slot></slot>
      {#each hotkeys as binding, bindingInd}
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
            {#if isPotentiallyInvalidBindingWithArgument(binding)}
            <!-- TODO in the future, the argument isn't necessarily going to be a number. -->
              <input
                bind:value={binding.actionArgument}
                required
                type="number"
                step="any"
                style="width: 14ch"
              >
            {/if}
          </td>
          {#if displayOverrideWebsiteHotkeysColumn}
            <td style="text-align: center;">
              <input
                bind:checked={binding.overrideWebsiteHotkeys}
                type="checkbox"
              />
            </td>
          {/if}
          <td>
            <button
              type="button"
              on:click={e => removeBinding(bindingInd)}
              aria-label="{getMessage('removeBinding')}"
            >🗑️</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <button
    type="button"
    on:click={addNewBinding}
    aria-label="{getMessage('addBinding')}"
  >➕</button>
</div>
