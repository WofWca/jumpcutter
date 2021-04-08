// Migration from 1.0.0. Number settings were saved as strings, but in later versions they're assumed to be numbers.
// Once everyone has installed this version or a later one, this file can be removed, along with other changes coming
// with this commit (so you could `git revert` it).

import browser from '@/webextensions-api';
import { defaultSettings } from '@/settings';

export default async function (): Promise<void> {
  const settings = await browser.storage.sync.get(defaultSettings);
  const toFix = ['volumeThreshold', 'silenceSpeed', 'soundedSpeed'] as const;
  function getDefault(key: typeof toFix[number]): number {
    // The `silenceSpeed` key is not present in defaultSettings, it was removed in 1.9.0.
    if (key === 'silenceSpeed') {
      return 4;
    }
    return defaultSettings[key];
  }
  for (const key of toFix) {
    const val = settings[key];
    if (typeof val !== 'number') {
      const parsed = parseFloat(val);
      settings[key] = (Number.isFinite(parsed) && parsed > 0 && parsed < 15)
        ? parsed
        : getDefault(key);
    }
  }
  await browser.storage.sync.set(settings);
}
