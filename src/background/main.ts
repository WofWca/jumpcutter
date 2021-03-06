// TODO split this script so its unused parts can be unloaded. If I understand it correctly.
// https://developer.chrome.com/extensions/background_pages#unloading
// 1. migrations
// 2. settings saving.
import browser from '@/webextensions-api';

import manifest from '@/manifest.json';

import initBrowserHotkeysListener from './initBrowserHotkeysListener';
import initIconAndBadgeUpdater from './initIconAndBadgeUpdater';
import { storage } from '@/settings/_storage';

if (process.env.NODE_ENV !== 'production') {
  if (manifest.version !== '1.15.1') {
    console.error("Don't forget remove the following check, if you added any migrations (revert this commit), "
      + "or update the version string above otherwise");
  }
}
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
let postInstallDonePromiseResolve: () => void;
// Resolves when it is made sure that all migrations have been run (if there are any) and it is safe to operate the
// storage.
const postInstallDonePromise = new Promise<void>(r => postInstallDonePromiseResolve = r);
// Pretty hacky. Feels like there must be API that allows us to do this. TODO?
browser.storage.local.get('__lastHandledUpdateToVersion').then(({ __lastHandledUpdateToVersion }) => {
  if (currentVersion === __lastHandledUpdateToVersion) {
    postInstallDonePromiseResolve();
  }
});
browser.runtime.onInstalled.addListener(async details => {
  if (!['update', 'install'].includes(details.reason)) {
    return;
  }
  // In regard to popup or content scripts – this is pretty much guaranteed to finish running before them because
  // popups don't get opened immediately upon installation and in order to get content scripts to work you'd
  // need to reload the page.

  if (BUILD_DEFINITIONS.BROWSER !== 'gecko') {
    if (details.reason === 'update') {
      const { default: runRequiredMigrations } = await import(
        /* webpackExports: ['default'] */
        './migrations/runRequiredMigrations'
      );
      await runRequiredMigrations(details.previousVersion!);
    }
  }
  await setNewSettingsKeysToDefaults();

  browser.storage.local.set({ __lastHandledUpdateToVersion: currentVersion });
  postInstallDonePromiseResolve();
});

// Just for top-level `await`. Don't do this for the whole file cause `runtime.onInstalled.addListener` needs to be
// called synchronously (https://developer.chrome.com/docs/extensions/mv2/background_pages/#listeners).
(async () => {
  await postInstallDonePromise;

  initBrowserHotkeysListener();

  initIconAndBadgeUpdater();
})();
