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
import { watchAllElements } from './watchAllElements';
import { AllMediaElementsController } from './AllMediaElementsController';

// Per-tab overlay for controlling Jump Cutter
function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'jumpcutter-overlay';
  overlay.innerHTML = `
    <button id="jumpcutter-toggle" title="Toggle Jump Cutter for this tab">🚀</button>
  `;
  overlay.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 2147483647;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    border-radius: 8px;
    padding: 8px;
    font-size: 16px;
    cursor: pointer;
    user-select: none;
    transition: opacity 0.3s;
  `;
  document.body.appendChild(overlay);

  const toggleBtn = overlay.querySelector('#jumpcutter-toggle') as HTMLButtonElement;
  const tabId = `jumpcutter-${window.location.hostname}-${Date.now()}`; // Unique per tab/page load

  // Load state from sessionStorage
  const isEnabled = sessionStorage.getItem(tabId) !== 'disabled';

  updateToggleButton(toggleBtn, isEnabled);

  toggleBtn.addEventListener('click', () => {
    const newEnabled = !isEnabled;
    sessionStorage.setItem(tabId, newEnabled ? 'enabled' : 'disabled');
    updateToggleButton(toggleBtn, newEnabled);
    // TODO: Communicate to content script to enable/disable jumping
    // For now, just visual feedback
  });

  // Auto-hide after 3 seconds
  setTimeout(() => overlay.style.opacity = '0.5', 3000);
  overlay.addEventListener('mouseenter', () => overlay.style.opacity = '1');
  overlay.addEventListener('mouseleave', () => overlay.style.opacity = '0.5');
}

function updateToggleButton(btn: HTMLButtonElement, enabled: boolean) {
  btn.textContent = enabled ? '🚀' : '⏸️';
  btn.title = enabled ? 'Jump Cutter enabled for this tab' : 'Jump Cutter disabled for this tab';
  btn.style.background = enabled ? 'rgba(0, 128, 0, 0.8)' : 'rgba(128, 0, 0, 0.8)';
}

// Initialize only if not already present
if (!document.getElementById('jumpcutter-overlay')) {
  createOverlay();
}

watchAllElements(AllMediaElementsController.create);

(async function () { // Just for top-level `await`

async function importAndInit() {
  const init = (await import(
    /* webpackExports: ['default'] */
    './init'
  )).default
  await requestIdlePromise({ timeout: 5000 })
  init();
}

const keys: Partial<Settings> = { enabled: enabledSettingDefaultValue } as const;
const enabledOnInitialization = (
  (await browserOrChrome.storage[mainStorageAreaName].get(keys)) as Settings
).enabled;
if (enabledOnInitialization) {
  importAndInit();
}
// Not using `addOnStorageChangedListener` from '@/settings' because it's heavy because of `filterOutUnchangedValues`.
// TODO use it when (if?) it's gone.
browserOrChrome.storage.onChanged.addListener(function (changes: MyStorageChanges, areaName) {
  if (areaName !== mainStorageAreaName) {
    return;
  }
  const maybeEnabledChange = changes.enabled;
  // Don't need to check if it's already initialized/deinitialized because it's a setting CHANGE, and it's already
  // initialized/deinitialized in accordance to the setting a few lines above.
  // Need to check both `newValue` and `oldValue` because:
  // 1. In Gecko, it is currently possible that `newValue === oldValue`. See `filterOutUnchangedValues` in '@/settings'.
  // 2. When the extension is first installed and the storage is empty, `enabled` may be set to `true` with the first
  //    settings change and `newValue === true && oldValue === undefined`.
  if (maybeEnabledChange?.newValue === true && maybeEnabledChange.oldValue === false) {
    importAndInit();
  }
});

})();
