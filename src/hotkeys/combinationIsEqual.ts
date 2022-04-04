import type { KeyCombination } from './';

export function combinationIsEqual(a: KeyCombination, b: KeyCombination): boolean {
  const modifiersA = a.modifiers ?? [];
  const modifiersB = b.modifiers ?? [];
  return a.code === b.code
    && modifiersA.length === modifiersB.length
    && modifiersA.every(mA => modifiersB.includes(mA));
}
