import type { KeyCombination } from './';
import { modifierFlagPropNames } from './modifierFlagPropNames';

export function eventMatchesCombination(event: KeyboardEvent, combination: KeyCombination): boolean {
  return combination.code === event.code
    && modifierFlagPropNames.every(key => event[key] === (combination.modifiers ?? []).includes(key))
}
