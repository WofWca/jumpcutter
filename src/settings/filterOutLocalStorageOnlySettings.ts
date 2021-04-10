import { localStorageOnlyKeys, Settings } from './';

export function filterOutLocalStorageOnlySettings(values: Partial<Settings>): Partial<Settings> {
  const toReturn: typeof values = {};
  for (const [_k, v] of Object.entries(values)) {
    const k = _k as keyof typeof values;
    if (!localStorageOnlyKeys.includes(k)) {
      (toReturn[k] as typeof toReturn[typeof k]) = v;
    }
  }
  return toReturn;
}
