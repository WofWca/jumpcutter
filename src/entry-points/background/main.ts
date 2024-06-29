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

// TODO split this script so its unused parts can be unloaded. If I understand it correctly.
// https://developer.chrome.com/extensions/background_pages#unloading
// 1. migrations
// 2. settings saving.
import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';

import { onCommand as onCommandWhenReady } from './browserHotkeysListener';
import { initIconAndBadge, updateIconAndBadge } from './iconAndBadgeUpdater';
import { storage } from '@/settings/_storage';
import { createWrapperListener, getSettings, settingsChanges2NewValues } from '@/settings';
import { defaultSettings } from '@/settings';
import runRequiredMigrations from './migrations/runRequiredMigrations';

// Remember that we need to attach the event listeners at the top level since it's a
// non-persistent background script:
// * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts#move_event_listeners
// * https://developer.chrome.com/docs/extensions/mv2/background_migration/#listeners
// Make sure that Webpack doesn't botch it.

// This is so we don't have to retrieve settings like this `storage.local.get(defaultSettings)` every time and can
// instead `storage.local.get()`. This at least reduces chunk size, and may be better for performance.
async function setNewSettingsKeysToDefaults() {
  const existingSettingsP = storage.get();

  // TODO perf: dynamic import for service worker
  // const { defaultSettings } = await import(
  //   /* webpackExports: ['defaultSettings'] */
  //   '@/settings'
  // );

  const newSettings = {
    ...defaultSettings,
    ...(await existingSettingsP),
  };
  await storage.set(newSettings);
}

const currentVersion = browserOrChrome.runtime.getManifest().version;
let postInstallStorageChangesDonePResolve: (storageMightHaveBeenChanged: boolean) => void;
/**
 * Resolves when it is made sure that all migrations have been run (if there are any) and it is safe to operate the
 * storage. The resolve value indicates if we might have made changes to the storage.
 */
const postInstallStorageChangesDoneP = new Promise<boolean>(r => postInstallStorageChangesDonePResolve = r);
// Pretty hacky. Feels like there must be API that allows us to do this. TODO?
browserOrChrome.storage.local.get('__lastHandledUpdateToVersion').then(({ __lastHandledUpdateToVersion }) => {
  if (currentVersion === __lastHandledUpdateToVersion) {
    postInstallStorageChangesDonePResolve(false);
  }
});
browserOrChrome.runtime.onInstalled.addListener(async details => {
  if (!['update', 'install'].includes(details.reason)) {
    return;
  }
  // In regard to popup or content scripts – this is pretty much guaranteed to finish running before them because
  // popups don't get opened immediately upon installation and in order to get content scripts to work you'd
  // need to reload the page.
  if (details.reason === 'update') {
    // TODO perf: dynamic import for service worker
    // const { default: runRequiredMigrations } = await import(
    //   /* webpackExports: ['default'] */
    //   './migrations/runRequiredMigrations'
    // );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await runRequiredMigrations(details.previousVersion!);
  }
  await setNewSettingsKeysToDefaults();

  browserOrChrome.storage.local.set({ __lastHandledUpdateToVersion: currentVersion });
  postInstallStorageChangesDonePResolve(true);
});

// `commands` API is currently not supported by Gecko for Android.
browserOrChrome.commands?.onCommand?.addListener?.(async (...args) => {
  await postInstallStorageChangesDoneP;
  onCommandWhenReady(...args);
});

let mayThisOnStorageChangeEventBeCausedByPostInstallScriptP: Promise<boolean> | boolean
= (async () => {
  const storageMightHaveBeenChangedByPostInstallScript = await postInstallStorageChangesDoneP;
  return storageMightHaveBeenChangedByPostInstallScript;
})();
(async () => {
  await postInstallStorageChangesDoneP;
  setTimeout(() => setTimeout(() => {
    // After some time all the the `storage.onChanged` listeners, that might have been triggered
    // by the post-install script, have been executed so we don't expect any more of them.
    // Yes, it may already be `Awaited<false>`
    mayThisOnStorageChangeEventBeCausedByPostInstallScriptP = false;
  }));
})();

const settingsP = postInstallStorageChangesDoneP.then(() => getSettings());

const initIconAndBadgeP = settingsP.then(s => initIconAndBadge(s));
const onStorageChanged = createWrapperListener(async changes => {
  const settings = await settingsP;
  // Yes, every time this function executes, `await settingsP` is the same
  // object, so mutations to it persist.
  Object.assign(settings, settingsChanges2NewValues(changes));

  await initIconAndBadgeP;
  updateIconAndBadge(settings, changes);
});

browserOrChrome.storage.onChanged.addListener(async (...args) => {
  // We can't just ignore all the events that were fired before `postInstallStorageChangesDoneP`
  // resolved because this script is non-persistent and it may be woken up, that is executed all
  // over again just to handle a `storage.onChanged` event, so this listener is gonna be executed
  // immediately, before we can know if we need to make post-install changes to the storage.
  if (await mayThisOnStorageChangeEventBeCausedByPostInstallScriptP) {
    return;
  }

  await onStorageChanged(...args);
});
