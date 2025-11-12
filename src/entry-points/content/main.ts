/**
 * @license
 * Copyright (C) 2020, 2021, 2022, 2025  WofWca <wofwca@protonmail.com>
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

import { enabledSettingDefaultValue, MyStorageChanges, Settings } from '@/settings';
import { mainStorageAreaName } from '@/settings/mainStorageAreaName';
import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';
import requestIdlePromise from './helpers/requestIdlePromise';
import { PerTabControlPanel } from './PerTabControlPanel';

(async function () { // Just for top-level `await`

let perTabControl: PerTabControlPanel | null = null;
let isInitialized = false;

async function importAndInit() {
  if (isInitialized) return;
  
  const init = (await import(
    /* webpackExports: ['default'] */
    './init'
  )).default
  await requestIdlePromise({ timeout: 5000 })
  init();
  isInitialized = true;
}

async function deinitialize() {
  if (!isInitialized) return;
  
  // Send a message to trigger cleanup in init.ts
  // The init module listens for storage changes to cleanup
  isInitialized = false;
}

// Create per-tab control overlay
perTabControl = new PerTabControlPanel();
perTabControl.createOverlay(async (enabled: boolean) => {
  if (enabled) {
    await importAndInit();
  } else {
    await deinitialize();
  }
});

// Check global enabled state
const keys: Partial<Settings> = { enabled: enabledSettingDefaultValue } as const;
const globalSettings = (await browserOrChrome.storage[mainStorageAreaName].get(keys)) as Settings;
const globalEnabled = globalSettings.enabled;

// Only initialize if both global and per-tab are enabled
if (globalEnabled && perTabControl.getEnabled()) {
  importAndInit();
}
// Listen for global enabled state changes
browserOrChrome.storage.onChanged.addListener(function (changes: MyStorageChanges, areaName) {
  if (areaName !== mainStorageAreaName) {
    return;
  }
  const maybeEnabledChange = changes.enabled;
  
  // Only respond to global setting changes if per-tab is also enabled
  if (maybeEnabledChange?.newValue === true && maybeEnabledChange.oldValue === false) {
    if (perTabControl && perTabControl.getEnabled()) {
      importAndInit();
    }
  } else if (maybeEnabledChange?.newValue === false && maybeEnabledChange.oldValue === true) {
    deinitialize();
  }
});

})();
