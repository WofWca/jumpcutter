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

import type { HotkeyAction } from './HotkeyAction';
import type { allNoArgumentActions } from './allNoArgumentActions';
import type { DeepReadonly } from "@/helpers";

// I've got a feeling that this code will become obsolete sooner than it should. TODO maybe use a library?

export type ModifierPropName = keyof Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;
// Consider replacing it with a tuple to save some storage space (to fit the `QUOTA_BYTES_PER_ITEM` quota).
export interface KeyCombination {
  code: KeyboardEvent['code'];
  modifiers?: ModifierPropName[];
}

export type NonSettingsAction =
  HotkeyAction.REWIND
  | HotkeyAction.ADVANCE
  | HotkeyAction.TOGGLE_PAUSE
  | HotkeyAction.TOGGLE_MUTE
  | HotkeyAction.INCREASE_VOLUME
  | HotkeyAction.DECREASE_VOLUME
;

export type NoArgumentAction = typeof allNoArgumentActions[number];
export type HotkeyActionArguments<T extends HotkeyAction> = T extends NoArgumentAction ? never : number;

// Consider replacing it with a tuple to save some storage space (to fit the `QUOTA_BYTES_PER_ITEM` quota).
export type HotkeyBinding<T extends HotkeyAction = HotkeyAction> = {
  keyCombination: KeyCombination;
  action: T;
  overrideWebsiteHotkeys?: boolean,
  actionArgument?: HotkeyActionArguments<T>;
} & (T extends NoArgumentAction
  ? { actionArgument?: never }
  : { actionArgument: HotkeyActionArguments<T> }
);

export type NonSettingsActions = Array<DeepReadonly<HotkeyBinding<NonSettingsAction>>>;

export * from './allNoArgumentActions';
export * from './combinationIsEqual';
export * from './combinationToString';
export * from './eventTargetIsInput';
export * from './eventToCombination';
export * from './HotkeyAction';
export * from './hotkeyActionToString';
export * from './keydownEventToActions';
