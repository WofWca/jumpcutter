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

import browser from '@/webextensions-api';
import type { Settings } from "@/settings";

export default async function (): Promise<void> {
  const storage = browser.storage.local;
  const defaults = {
    silenceSpeed: 4,
    soundedSpeed: 1.5,
    enableExperimentalFeatures: true,
  };
  const { silenceSpeed, soundedSpeed, enableExperimentalFeatures } = await storage.get(defaults) as typeof defaults;
  let multiplier = silenceSpeed / soundedSpeed;
  if (!(0 < multiplier && multiplier <= 10)) { // Check if it's reasonable (and if it's a nubmer at all, just in case).
    multiplier = 2;
  }
  const newValues: Partial<Settings> = {
    silenceSpeedSpecificationMethod: 'relativeToSoundedSpeed',
    silenceSpeedRaw: multiplier,
  }
  if (enableExperimentalFeatures === false) {
    // Since the new version, this is practically equivalent.
    newValues.marginBefore = 0;
  }
  await storage.remove(['silenceSpeed', 'enableExperimentalFeatures']);
  await storage.set(newValues);
}
