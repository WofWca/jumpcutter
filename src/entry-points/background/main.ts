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

// TODO split this script so its unused parts can be unloaded. If I understand it correctly.
// https://developer.chrome.com/extensions/background_pages#unloading
// 1. migrations
// 2. settings saving.
import browser from '@/webextensions-api';

import initBrowserHotkeysListener from './initBrowserHotkeysListener';
import initIconAndBadgeUpdater from './initIconAndBadgeUpdater';
import { storage } from '@/settings/_storage';

// This is so we don't have to retrieve settings like this `storage.local.get(defaultSettings)` every time and can
// instead `storage.local.get()`. This at least reduces chunk size, and may be better for performance.
async function setNewSettingsKeysToDefaults() {
  const existingSettingsP = storage.get();
  const { defaultSettings } = await import(
    /* webpackExports: ['defaultSettings'] */
    '@/settings'
  );
  const newSettings = {
    ...defaultSettings,
    ...(await existingSettingsP),
  };
  await storage.set(newSettings);
}

const currentVersion = chrome.runtime.getManifest().version;
let postInstallStorageChangesDonePResolve: () => void;
// Resolves when it is made sure that all migrations have been run (if there are any) and it is safe to operate the
// storage.
const postInstallStorageChangesDoneP = new Promise<void>(r => postInstallStorageChangesDonePResolve = r);
// Pretty hacky. Feels like there must be API that allows us to do this. TODO?
browser.storage.local.get('__lastHandledUpdateToVersion').then(({ __lastHandledUpdateToVersion }) => {
  if (currentVersion === __lastHandledUpdateToVersion) {
    postInstallStorageChangesDonePResolve();
  }
});
browser.runtime.onInstalled.addListener(async details => {
  if (!['update', 'install'].includes(details.reason)) {
    return;
  }
  // In regard to popup or content scripts – this is pretty much guaranteed to finish running before them because
  // popups don't get opened immediately upon installation and in order to get content scripts to work you'd
  // need to reload the page.
  if (details.reason === 'update') {
    const { default: runRequiredMigrations } = await import(
      /* webpackExports: ['default'] */
      './migrations/runRequiredMigrations'
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await runRequiredMigrations(details.previousVersion!);
  }
  await setNewSettingsKeysToDefaults();

  browser.storage.local.set({ __lastHandledUpdateToVersion: currentVersion });
  postInstallStorageChangesDonePResolve();
});

// Just for top-level `await`. Don't do this for the whole file cause `runtime.onInstalled.addListener` needs to be
// called synchronously (https://developer.chrome.com/docs/extensions/mv2/background_pages/#listeners).
(async () => {
  await postInstallStorageChangesDoneP;

  initBrowserHotkeysListener();

  initIconAndBadgeUpdater();
})();
