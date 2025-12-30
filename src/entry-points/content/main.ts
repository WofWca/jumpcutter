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
import FloatingPill from './FloatingPill.svelte';
import { destroyController } from './init';
import { updatePerTabCache } from './perTabState';
import { ensurePerTabIdentity, getPerTabKeySync } from './perTabIdentity';

// Use a robust guard that is independent of URL so we only initialize once per frame
const INIT_KEY = '__jumpCutterInit';
if ((window as any)[INIT_KEY]) {
  console.warn('[JumpCutter] Already running in this frame, exiting');
  throw new Error('Already initialized');
}
// Set flag immediately and synchronously
Object.defineProperty(window, INIT_KEY, {
  value: true,
  writable: false,
  configurable: false
});

(async function () { // Just for top-level `await`

console.log('[JumpCutter] Content script starting...', window.location.href);

// Only run in top frame for YouTube to avoid iframe interference
const isYouTube = window.location.hostname.includes('youtube.com');
if (isYouTube && window !== window.top) {
  console.log('[JumpCutter] Skipping iframe on YouTube');
  return;
}

console.log('[JumpCutter] Getting tab identity...');
await ensurePerTabIdentity();
console.log('[JumpCutter] Tab identity obtained');
const perTabEnabledKey = getPerTabKeySync('perTabEnabled');
const perTabPanelKey = getPerTabKeySync('perTabPanel');

let perTabControl: FloatingPill | null = null;
let isInitialized = false;
let perTabEnabled = false; // Default to disabled

async function importAndInit() {
  if (isInitialized) {
    console.log('[JumpCutter] Already initialized, skipping');
    return;
  }
  
  console.log('[JumpCutter] Importing and initializing controller...', {
    url: window.location.href,
    isTopFrame: window === window.top,
    frameDepth: window.top ? (window === window.top ? 0 : 1) : 'unknown'
  });
  const init = (await import(
    /* webpackExports: ['default'] */
    './init'
  )).default
  await requestIdlePromise({ timeout: 5000 })
  init();
  isInitialized = true;
  console.log('[JumpCutter] Controller initialized successfully');
}

// Get tab ID for unique storage key
const tabIdResult = await new Promise<{ tabId: number | null }>((resolve) => {
  (browserOrChrome.runtime.sendMessage as (msg: unknown, cb: (r: { tabId: number | null }) => void) => void)(
    { type: 'jumpcutter:getTabId' }, 
    resolve
  );
});
const tabId = tabIdResult?.tabId ?? Math.floor(Math.random() * 1000000);

// Create container for Svelte component
const pillContainer = document.createElement('div');
pillContainer.id = 'jc-floating-pill-root';
document.body.appendChild(pillContainer);

// Toggle handler
async function handleToggle(enabled: boolean) {
  console.log('[JumpCutter] Per-tab toggle changed to:', enabled);
  
  // Only process if state actually changed
  if (perTabEnabled === enabled) {
    return;
  }
  
  perTabEnabled = enabled;
  
  // Update the cache immediately
  updatePerTabCache(enabled);
  
  // Save to extension storage for persistence
  await browserOrChrome.storage.local.set({ [perTabEnabledKey]: enabled });
  
  // If disabled, destroy the controller to stop all interference
  if (!enabled) {
    destroyController();
    isInitialized = false;
  } else {
    // Initialize when enabling (per-tab enable should work regardless of global setting)
    if (!isInitialized) {
      await importAndInit();
      // Apply per-tab settings after controller init
      if (perTabControl) {
        await perTabControl.applyPerTabSettings();
      }
    }
  }
}

// Create Svelte floating pill control
console.log('[JumpCutter] Creating floating pill...');
perTabControl = new FloatingPill({
  target: pillContainer,
  props: {
    tabId,
    onToggle: handleToggle
  }
});

// Get initial enabled state from component
perTabEnabled = perTabControl.getEnabled();
console.log('[JumpCutter] Per-tab state loaded:', { perTabEnabled, perTabEnabledKey, tabId });
console.log('[JumpCutter] Floating pill created!');

// Check global enabled state
const keys: Partial<Settings> = { enabled: enabledSettingDefaultValue } as const;
const globalSettings = (await browserOrChrome.storage[mainStorageAreaName].get(keys)) as Settings;
const globalEnabled = globalSettings.enabled === true; // Only enabled if explicitly true

console.log('[JumpCutter] Initialization check:', {
  globalEnabled,
  perTabEnabled: perTabControl.getEnabled(),
  url: window.location.href,
  isTopFrame: window === window.top,
  alreadyInitialized: isInitialized
});

// Initialize if per-tab is enabled (per-tab takes precedence over global)
if (perTabEnabled && !isInitialized) {
  console.log('[JumpCutter] Starting initialization (per-tab enabled)...');
  await importAndInit();
} else if (isInitialized) {
  console.log('[JumpCutter] Already initialized, skipping startup init');
} else {
  console.log('[JumpCutter] Not initializing (per-tab disabled)');
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
