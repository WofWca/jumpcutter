/**
 * @license
 * Copyright (C) 2020, 2021, 2022, 2023  WofWca <wofwca@protonmail.com>
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
import type { Settings, MyStorageChanges } from '@/settings';

function setBadge(text: string, color: string) {
  browser.action.setBadgeBackgroundColor({ color });
  browser.action.setBadgeText({ text });
}
type SupportedSettings = keyof Pick<Settings, 'soundedSpeed' | 'silenceSpeedRaw' | 'volumeThreshold' | 'marginBefore'
  | 'marginAfter'>;
function settingToBadgeParams<T extends SupportedSettings>(
  settingName: T,
  value: Settings[T]
): Parameters<typeof setBadge>
{
  switch (settingName) {
    // TODO refactor: DRY colors? Though here they're darker anyway, to account for the white text.
    // TODO refactor: Also DRY `toFixed` precision, to match the popup?
    case 'soundedSpeed': return [value.toFixed(2), '#0d0'];
    case 'silenceSpeedRaw': return [value.toFixed(2), '#d00'];
    // I guess it's better when it's blue and not red, so it's not confused with `silenceSpeed`.
    case 'volumeThreshold': return [value.toFixed(4), '#00d'];
    // TODO improvement: any better ideas for background colors for these two?
    case 'marginBefore': return [value.toFixed(3), '#333'];
    case 'marginAfter': return [value.toFixed(3), '#333'];
    // default: assertNever(settingName); Does not work because of the generic type. TODO
    default: throw new Error();
  }
}
function setBadgeToDefault(settings: Settings) {
  if (settings.badgeWhatSettingToDisplayByDefault === 'none' || !settings.enabled) {
    browser.action.setBadgeText({ text: '' });
  } else {
    const settingName = settings.badgeWhatSettingToDisplayByDefault;
    setBadge(...settingToBadgeParams(settingName, settings[settingName]));
  }
}
let setBadgeToDefaultTimeout = -1;
function temporarelySetBadge(text: string, color: string, settings: Settings) {
  setBadge(text, color);
  clearTimeout(setBadgeToDefaultTimeout);
  // TODO improvement: customizable timeout duration
  // TODO refactor: do we need to migrate to alarms or is 1500ms fine?
  setBadgeToDefaultTimeout = (setTimeout as typeof window.setTimeout)(setBadgeToDefault, 1500, settings);
}

let currentPath64: string | undefined;
function setIcon(settings: Pick<Settings, 'enabled' | 'volumeThreshold'>) {
  const iconsDir = '/icons/';
  let icon64, icon128;
  // TODO refactor: these image files are just copy-pasted, with only class name being different. DRY.
  if (!settings.enabled) {
    icon64 = 'icon-disabled.svg-64.png';
    icon128 = 'icon-disabled.svg-128.png';
  } else if (settings.volumeThreshold === 0) {
    icon64 = 'icon-only-sounded.svg-64.png';
    icon128 = 'icon-only-sounded.svg-128.png';
  } else {
    icon64 = 'icon.svg-64.png';
    icon128 = 'icon.svg-128.png';
  }

  const path64 = iconsDir + icon64;
  const path128 = iconsDir + icon128;

  // Apparently it doesn't perform this check internally. TODO chore: report bug / fix.
  if (path64 !== currentPath64) {
    browser.action.setIcon({
      path: {
        "64": path64,
        "128": path128,
      }
    });

    currentPath64 = path64;
  }
}

export function updateIconAndBadge(
  newSettings: Settings,
  changes: MyStorageChanges,
) {
  setIcon(newSettings);

  // TODO improvement: also display `video.volume` changes? Perhaps this script belongs to `content/main.ts`?
  const orderedSetingsNames =
    ['soundedSpeed', 'silenceSpeedRaw', 'volumeThreshold', 'marginBefore', 'marginAfter'] as const;
  for (const settingName of orderedSetingsNames) {
    const currSettingChange = changes[settingName];
    if (currSettingChange) {
      temporarelySetBadge(...settingToBadgeParams(settingName, currSettingChange.newValue!), newSettings);
      break;
    }
  }
  // TODO refactor: it would be cooler if we wrote the badge's dependencies more declaratively.
  if (changes.badgeWhatSettingToDisplayByDefault || changes.enabled) {
    setBadgeToDefault(newSettings);
  }
}

export function initIconAndBadge(settings: Settings) {
  setBadgeToDefault(settings);
  setIcon(settings);
}
