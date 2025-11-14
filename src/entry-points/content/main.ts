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
import { PerTabControlPanel } from './PerTabControlPanelV3';
import { updatePerTabCache } from './perTabState';

(async function () { // Just for top-level `await`

let perTabControl: PerTabControlPanel | null = null;
let isInitialized = false;
let perTabEnabled = true;

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

// Create per-tab control overlay
perTabControl = new PerTabControlPanel();
perTabEnabled = perTabControl.getEnabled();

// Set up the overlay with a simpler callback
perTabControl.createOverlay(async (enabled: boolean) => {
  console.log('[JumpCutter] Per-tab toggle changed to:', enabled);
  perTabEnabled = enabled;
  
  // Update the cache immediately
  updatePerTabCache(enabled);
  
  // Store per-tab state in both storages for the controller to check
  const url = window.location.href;
  const key = `perTabEnabled_${url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)}`;
  
  // Save to localStorage for synchronous access in controller
  try {
    localStorage.setItem(key, String(enabled));
  } catch (e) {
    // Ignore localStorage errors
  }
  
  // Also save to extension storage for persistence
  await browserOrChrome.storage.local.set({ [key]: enabled });
  
  // If enabling and not initialized, initialize
  if (enabled && !isInitialized) {
    const globalSettings = (await browserOrChrome.storage[mainStorageAreaName].get({ enabled: enabledSettingDefaultValue })) as Settings;
    if (globalSettings.enabled !== false) {
      await importAndInit();
    }
  }
  // Don't destroy when disabling - let the controller handle the enabled state internally
});

// Check global enabled state
const keys: Partial<Settings> = { enabled: enabledSettingDefaultValue } as const;
const globalSettings = (await browserOrChrome.storage[mainStorageAreaName].get(keys)) as Settings;
const globalEnabled = globalSettings.enabled !== false; // Default to true if not set

console.log('[JumpCutter] Initialization:', {
  globalEnabled,
  perTabEnabled: perTabControl.getEnabled(),
  url: window.location.href
});

// Only initialize if both global and per-tab are enabled
if (globalEnabled && perTabControl.getEnabled()) {
  console.log('[JumpCutter] Starting initialization...');
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
    // Don't deinitialize - let the controller handle the enabled state
    console.log('[JumpCutter] Global disabled, controller will handle state internally');
  }
});

})();
