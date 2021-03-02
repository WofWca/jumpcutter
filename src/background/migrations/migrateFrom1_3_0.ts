// Migration from 1.0.0. Number settings were saved as strings, but in later versions they're assumed to be numbers.
// Once everyone has installed this version or a later one, this file can be removed, along with other changes coming
// with this commit (so you could `git revert` it).

import browser from 'webextension-polyfill';
import { defaultSettings } from '@/settings';

export default async function (): Promise<void> {
  const settings = await browser.storage.sync.get(defaultSettings);
  const toFix = ['volumeThreshold', 'silenceSpeed', 'soundedSpeed'] as const;
  function getOldDefault(key: typeof toFix[number]): number {
    // TODO this is ugly.
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
        : getOldDefault(key);
    }
  }
  await browser.storage.sync.set(settings);
}
