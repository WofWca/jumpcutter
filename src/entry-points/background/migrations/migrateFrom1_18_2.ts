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

import { defaultSettings, Settings } from '@/settings';
import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';

// A fix for https://github.com/WofWca/jumpcutter/issues/30
// (make it impossible to set soundedSpeed to 0 using popup inputs and change it to be non-zero if it already is).
export default async function (): Promise<void> {
  const {
    popupSoundedSpeedMin,
    popupSoundedSpeedStep: popupSoundedSpeedStepFromStorage,
    soundedSpeed,
  } = await browserOrChrome.storage.local.get(['popupSoundedSpeedMin', 'popupSoundedSpeedStep', 'soundedSpeed']);
  const popupSoundedSpeedStep = popupSoundedSpeedStepFromStorage ?? defaultSettings.popupSoundedSpeedStep;

  const newValues: Partial<Settings> = {};
  // Otherwise the user already changed it or the value for this setting was never set (in case we're updating
  // from an older version that didn't have it).
  if (popupSoundedSpeedMin === 0) {
    newValues.popupSoundedSpeedMin = popupSoundedSpeedStep;
  }
  // Otherwise same as above.
  if (soundedSpeed === 0) {
    newValues.soundedSpeed = popupSoundedSpeedStep;
  }
  await browserOrChrome.storage.local.set(newValues);
}
