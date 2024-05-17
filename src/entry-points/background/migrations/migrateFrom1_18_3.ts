/**
 * @license
 * Copyright (C) 2021, 2022  WofWca <wofwca@protonmail.com>
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

import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';
import { defaultSettings, Settings } from '@/settings';

export default async function (): Promise<void> {
  const {
    popupChartLengthInSeconds,
    soundedSpeed,
  } = await browserOrChrome.storage.local.get(['popupChartLengthInSeconds', 'soundedSpeed']);

  const newValues: Partial<Settings> = {};

  // A fix of the faulty `migrateFrom1_16_7.ts`. There `popupChartLengthInSeconds` could be
  // missing in the storage if the `previousVersion` is an old one, which would reslt in `popupChartLengthInSeconds`
  // becoming `NaN`.
  if (!Number.isFinite(popupChartLengthInSeconds)) {
    newValues.popupChartLengthInSeconds = defaultSettings.popupChartLengthInSeconds
  }

  // A fix for the faulty `migrateFrom1_18_2.ts`. There `popupSoundedSpeedStep` could be missing from the storage so
  // if `soundedSpeed` was 0 (which was possible to make it so in `1.0.0`) it would become `undefined`.
  // Why don't we also try to fix `popupSoundedSpeedMin`? Because if `popupSoundedSpeedMin` is 0, this means that
  // `popupSoundedSpeedStep` is not missing because these keys were added in the same version and we write
  // default settings to storage upon their addition (see `setNewSettingsKeysToDefaults`).
  if (soundedSpeed === undefined) {
    newValues.soundedSpeed = defaultSettings.soundedSpeed;
  }

  await browserOrChrome.storage.local.set(newValues);
}
