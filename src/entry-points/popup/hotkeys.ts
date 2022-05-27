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

import { keydownEventToActions, eventTargetIsInput, NonSettingsActions } from '@/hotkeys';
import type { Settings } from '@/settings';

type RequiredSettings =
  & Parameters<typeof keydownEventToActions>[1]
  & Pick<Settings, 'popupDisableHotkeysWhileInputFocused' | 'popupSpecificHotkeys'>;
export default function createKeydownListener(
  onNonSettingsActions: (nonSettingsActions: NonSettingsActions) => void,
  getSettings: () => RequiredSettings,
  onNewSettingsValues: (newValues: Partial<Settings>) => void,
): (e: KeyboardEvent) => void {
  const undeferred = (e: KeyboardEvent): void => {
    const settings = getSettings();
    if (eventTargetIsInput(e) && settings.popupDisableHotkeysWhileInputFocused) return;
    // TODO creating a new array on each keydown is not quite good for performance. Or does it get optimized internally?
    // Or maybe we can call `keydownEventToActions` twice for each array. Nah, easier to modify `keydownEventToActions`.
    const actions = keydownEventToActions(e, settings, [...settings.hotkeys, ...settings.popupSpecificHotkeys]);
    if (!actions) {
      return;
    }
    const [ settingsNewValues, nonSettingsActions ] = actions;
    onNewSettingsValues(settingsNewValues);
    onNonSettingsActions(nonSettingsActions);
  };
  // `setTimeout` only for performance.
  return (e: KeyboardEvent) => setTimeout(undeferred, 0, e);
}
