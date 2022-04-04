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
