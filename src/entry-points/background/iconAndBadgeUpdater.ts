/**
 * @license
 * Copyright (C) 2020, 2021, 2022, 2023, 2025  WofWca <wofwca@protonmail.com>
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
import type { Settings, MyStorageChanges } from '@/settings';
import { assertDev } from '@/helpers';

function setGlobalBadge(text: string, color: string) {
  browserOrChrome.action.setBadgeBackgroundColor({ color });
  browserOrChrome.action.setBadgeText({ text });
}
type SupportedSettings = keyof Pick<Settings, 'soundedSpeed' | 'silenceSpeedRaw' | 'volumeThreshold' | 'marginBefore'
  | 'marginAfter'>;
function settingToBadgeParams<T extends SupportedSettings>(
  settingName: T,
  value: Settings[T]
): Parameters<typeof setGlobalBadge>
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
const stashedTabSpecificBadges = new Map<
  number,
  {
    text: string;
    color: Parameters<
      typeof chrome.action.setBadgeBackgroundColor
    >[0]['color'];
  }
>();
function setBadgeToDefault(settings: Settings) {
  if (
    settings.badgeWhatSettingToDisplayByDefault === 'none'
    || settings.badgeWhatSettingToDisplayByDefault === 'timeSaved'
    || !settings.enabled
  ) {
    browserOrChrome.action.setBadgeText({ text: '' });

    if (
      settings.badgeWhatSettingToDisplayByDefault === 'timeSaved'
      && settings.enabled
    ) {
      // Restore the stashed values
      for (const [tabId, badgeValue] of stashedTabSpecificBadges.entries()) {
        browserOrChrome.action.setBadgeText({ tabId, text: badgeValue.text })
        browserOrChrome.action.setBadgeBackgroundColor({ tabId, color: badgeValue.color })
      }
      // We restored them, no longer need in the stash.
      stashedTabSpecificBadges.clear()
    }
  } else {
    const settingName = settings.badgeWhatSettingToDisplayByDefault;
    setGlobalBadge(...settingToBadgeParams(settingName, settings[settingName]));
  }
}
let setBadgeToDefaultTimeout: number | null = null;
async function temporarilySetBadge(text: string, color: string, settings: Settings) {
  const tabsMayHaveTabSpecificBadges =
    settings.badgeWhatSettingToDisplayByDefault == 'timeSaved';
  const isBadgeTemporarilyOverridden = setBadgeToDefaultTimeout != null
  if (
    tabsMayHaveTabSpecificBadges
    && !isBadgeTemporarilyOverridden
  ) {
    // Сlear the tab-specific badge for the current tab,
    // because it takes precedence over the global badge.
    // Also stash its state to restore it after timeout.

    const tabs = await browserOrChrome.tabs.query({ active: true })
    for (const tab of tabs) {
      const tabId = tab.id
      if (tabId == undefined) {
        console.warn('tab.id is', tabId, ', ignoring');
        continue;
      }

      // TODO perf: maybe we should just store the "time saved" values locally,
      // to avoid this async operation, so that we can
      // `setBadgesetBadge()` faster?
      await Promise.all([
        browserOrChrome.action.getBadgeText({ tabId }),
        browserOrChrome.action.getBadgeBackgroundColor({ tabId }),
      ]).then(([text, color]) => {
        if (text === '') {
          return
        }
        stashedTabSpecificBadges.set(tabId, { text, color });
      });

      browserOrChrome.action.setBadgeText({
        tabId,
        // @ts-expect-error ts(2322) the "types" package is not correct,
        // this can actually be `null`:
        // https://developer.chrome.com/docs/extensions/reference/api/action#parameters_10
        // > If tabId is specified and text is null,
        // > the text for the specified tab is cleared
        // > and defaults to the global badge text.
        text: null
      });
      resetTabSpecificBadgeColor(tabId, color)
    }
  }
  // Only do this _after_ `getBadgeText` and `getBadgeBackgroundColor`.
  setGlobalBadge(text, color);

  if (setBadgeToDefaultTimeout != null) {
    clearTimeout(setBadgeToDefaultTimeout);
  }
  // TODO improvement: customizable timeout duration
  // TODO refactor: do we need to migrate to alarms or is 1500ms fine?
  setBadgeToDefaultTimeout = (setTimeout as typeof window.setTimeout)(() => {
    setBadgeToDefault(settings);
    setBadgeToDefaultTimeout = null
  }, 1500);
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
    browserOrChrome.action.setIcon({
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
      temporarilySetBadge(...settingToBadgeParams(settingName, currSettingChange.newValue!), newSettings);
      break;
    }
  }
  // TODO refactor: it would be cooler if we wrote the badge's dependencies more declaratively.
  if (changes.badgeWhatSettingToDisplayByDefault || changes.enabled) {
    setBadgeToDefault(newSettings);

    if (
      changes.badgeWhatSettingToDisplayByDefault?.oldValue === "timeSaved"
      || changes.enabled?.newValue === false
    ) {
      // Reset all tab-specific badges
      browserOrChrome.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
          const tabId = tab.id
          if (tabId == undefined) {
            console.warn('tab.id is', tabId, ', ignoring');
            continue;
          }
          browserOrChrome.action.setBadgeText({
            tabId,
            // @ts-expect-error ts(2322) see another `setBadgeText` call above.
            text: null
          });
          // Yep, reset to white in Chromium. Not good, but let's wait
          // for Chromium to fix it (see the comments in the function).
          // This can be worked around by closing and then opening the tab
          // or the browser.
          //
          // TODO maybe we could at least _not_ set the color
          // on the tabs that do not have tab-specific color
          // (or have the color set to the "time saved" color) (or text).
          // But that would be over-engineering.
          resetTabSpecificBadgeColor(tabId, '#ffffff')
        }
      })
    }
  }
}

export function onNewTimeSavedInfo(tabId: number, timeSaved: string) {
  const newBadgeValue = {
    text: timeSaved,
    color: '#aae5ff'
  }

  const isBadgeTemporarilyOverridden = setBadgeToDefaultTimeout != null
  if (isBadgeTemporarilyOverridden) {
    stashedTabSpecificBadges.set(tabId, newBadgeValue)
  } else {
    browserOrChrome.action.setBadgeText({ tabId, text: newBadgeValue.text })
    browserOrChrome.action.setBadgeBackgroundColor({ tabId, color: newBadgeValue.color })
  }
}

export function initIconAndBadge(settings: Settings) {
  setBadgeToDefault(settings);
  setIcon(settings);
}

function resetTabSpecificBadgeColor(
  tabId: number,
  fallbackColor: Parameters<typeof chrome.action.setBadgeBackgroundColor>[0]['color']
) {
  if (BUILD_DEFINITIONS.BROWSER === 'chromium') {
    // Unfortunately in Chromium resetting tab-specific color
    // is not possible for now:
    // https://issues.chromium.org/issues/40073862
    // But it's not a big deal, let's just set it to the color we want.
    try {
      browserOrChrome.action.setBadgeBackgroundColor({
        tabId,
        // @ts-expect-error ts(2322) not possible in Chromium for now.
        color: null
      })
    } catch (error) {
      browserOrChrome.action.setBadgeBackgroundColor({ tabId, color: fallbackColor })
    }
  } else {
    assertDev(browserOrChrome === browser)
    browserOrChrome.action.setBadgeBackgroundColor({ tabId, color: null })
  }
}
