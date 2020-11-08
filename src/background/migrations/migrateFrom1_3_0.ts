// Migration from 1.0.0. Number settings were saved as strings, but in later versions they're assumed to be numbers.
// Once everyone has installed this version or a later one, this file can be removed, along with other changes coming
// with this commit (so you could `git revert` it).

import { defaultSettings, Settings } from '@/settings';

export default async function (): Promise<void> {
  const settings = await new Promise(r => chrome.storage.sync.get(defaultSettings, r as any)) as Settings;
  const toFix = ['volumeThreshold', 'silenceSpeed', 'soundedSpeed'] as const;
  for (const key of toFix) {
    const val = settings[key];
    if (typeof val !== 'number') {
      const parsed = parseFloat(val);
      settings[key] = (Number.isFinite(parsed) && parsed > 0 && parsed < 15)
        ? parsed
        : defaultSettings[key];
    }
    chrome.storage.sync.set(settings);
  }
}
