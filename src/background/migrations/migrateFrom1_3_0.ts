// Migration from 1.0.0. Number settings were saved as strings, but in later versions they're assumed to be numbers.
// Once everyone has installed this version or a later one, this file can be removed, along with other changes coming
// with this commit (so you could `git revert` it).

import browser from '@/webextensions-api';
import { defaultSettings } from '@/settings';

export default async function (): Promise<void> {
  const toFix = ['volumeThreshold', 'silenceSpeed', 'soundedSpeed'] as const;
  const values = await browser.storage.sync.get(toFix) as { [P in typeof toFix[number]]?: any };
  function getDefault(key: typeof toFix[number]): number {
    // The `silenceSpeed` key is not present in defaultSettings, it was removed in 1.9.0.
    if (key === 'silenceSpeed') {
      return 4;
    }
    return defaultSettings[key];
  }
  for (const key of toFix) {
    if (!(key in values)) {
      continue;
    }
    const val = values[key];
    if (typeof val !== 'number') {
      const parsed = parseFloat(val);
      values[key] = (Number.isFinite(parsed) && parsed > 0 && parsed < 15)
        ? parsed
        : getDefault(key);
    }
  }
  await browser.storage.sync.set(values);
}
