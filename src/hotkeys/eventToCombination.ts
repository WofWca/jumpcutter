/**
 * @license
 * Copyright (C) 2021, 2022  WofWca <wofwca@protonmail.com>
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

import type { KeyCombination } from '.';
import { modifierFlagPropNames } from './modifierFlagPropNames';

export function eventToCombination(e: KeyboardEvent): KeyCombination {
  const modifiers = modifierFlagPropNames.filter(flagName => e[flagName]);
  const combination: KeyCombination = {
    code: e.code,
  };
  if (modifiers.length) {
    // But this can create objects like `{ code: 'ControlLeft', modifiers: ['ctrlKey'] }`, which is redundant. TODO?
    // Or leave it as it is, just modify the `combinationToString` function to account for it?
    combination.modifiers = modifiers;
  }
  return combination;
}
