/**
 * @license
 * Copyright (C) 2020, 2021, 2022  WofWca <wofwca@protonmail.com>
 *
 * This file is part of Jump Cutter Browser Extension.
 *
 * Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jump Cutter Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
 */

import { HotkeyAction, HotkeyBinding, combinationIsEqual } from "@/hotkeys";
import browser from '@/webextensions-api';

/**
 * @param hotkeys - mutable
 * @return whether the new hotkeys have been added to the `hotkeys` parameter.
 */
function tryAddVolumeThresholdHotkeys(hotkeys: HotkeyBinding[]): boolean {
  const defaultVolumeThresholdHotkeys = [
    {
      keyCombination: { code: 'KeyE', },
      action: HotkeyAction.INCREASE_VOLUME_THRESHOLD,
      actionArgument: 0.001,
    },
    {
      keyCombination: { code: 'KeyW', },
      action: HotkeyAction.DECREASE_VOLUME_THRESHOLD,
      actionArgument: 0.001,
    },
  ] as const;
  const newHotkeys = [
    {
      keyCombination: { code: 'KeyE', modifiers: ['shiftKey'], },
      action: HotkeyAction.INCREASE_VOLUME_THRESHOLD,
      actionArgument: 0.010,
    },
    {
      keyCombination: { code: 'KeyW', modifiers: ['shiftKey'], },
      action: HotkeyAction.DECREASE_VOLUME_THRESHOLD,
      actionArgument: 0.010,
    },
  ] as HotkeyBinding<HotkeyAction.DECREASE_VOLUME_THRESHOLD | HotkeyAction.DECREASE_VOLUME_THRESHOLD>[];
  function bindingIsEqual(a: HotkeyBinding, b: HotkeyBinding) {
    return (
      a.action === b.action
      && combinationIsEqual(a.keyCombination, b.keyCombination)
      && a.actionArgument === b.actionArgument
      && (a.overrideWebsiteHotkeys ?? false) === (a.overrideWebsiteHotkeys ?? false)
    );
  }
  const defaultVolumeThresholdHotkeysPresent =
    defaultVolumeThresholdHotkeys
      .every(defaultBinding => hotkeys.some(binding => bindingIsEqual(binding, defaultBinding)));
  const newHotkeysAreAlreadyBound = hotkeys.some(({ keyCombination: existing }) => {
    return newHotkeys.some(({ keyCombination: newCombination }) => combinationIsEqual(newCombination, existing));
  })
  if (defaultVolumeThresholdHotkeysPresent && !newHotkeysAreAlreadyBound) {
    const insertAfter = hotkeys.findIndex(b => bindingIsEqual(b, defaultVolumeThresholdHotkeys[1]));
    hotkeys.splice(insertAfter + 1, 0, ...newHotkeys);
    return true;
  } else {
    return false;
  }
}

export default async function(): Promise<void> {
  const newValues: {
    popupDisableHotkeysWhileInputFocused: true,
    hotkeys?: HotkeyBinding[],
  } = {
    popupDisableHotkeysWhileInputFocused: true, // Since we now have volume up/down bound to arrows in popup.
  };
  // Add new hotkeys if the user didn't customize them much.
  const { hotkeys } = await browser.storage.local.get('hotkeys') as { hotkeys?: HotkeyBinding[] };
  if (hotkeys) {
    const added: boolean = tryAddVolumeThresholdHotkeys(hotkeys);
    if (added) {
      newValues.hotkeys = hotkeys;
    }
  }

  await browser.storage.local.set(newValues);
}
