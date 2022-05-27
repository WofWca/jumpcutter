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
