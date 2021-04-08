// TODO split this script so its unused parts can be unloaded. If I understand it correctly.
// https://developer.chrome.com/extensions/background_pages#unloading
// 1. migrations
// 2. settings saving.
import browser from '@/webextensions-api';

import manifest from '@/manifest.json';

import initBrowserHotkeysListener from './initBrowserHotkeysListener';
import initIconAndBadgeUpdater from './initIconAndBadgeUpdater';

import throttle from 'lodash/throttle';
import { Settings, MyStorageChanges, getSettings } from '@/settings';
import { storage } from '@/settings/_storage';

import { filterOutUnchangedValues } from '@/helpers';

if (process.env.NODE_ENV !== 'production') {
  if (manifest.version !== '1.14.0') {
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

  // The following code block synchronizes local storage with sync storage.
  // We'd be glad to only use `browser.storage.sync` directly, but in Chromium it is not capable of providing real-time
  // communication
  // between extension parts (i.e. background, content and popup scripts) because it has two throughput quotas
  // (https://developer.chrome.com/apps/storage#property-sync-MAX_WRITE_OPERATIONS_PER_HOUR) (which I don't quite
  // understand why exist. Shouldn't they be handled internally?).
  // Why not use ports? Because it takes more characters to set them up, and for this task, using storage is more
  // intuitive. If there's any kind of drawback in this, I think it can be fixed by improving the browser's code; TODO
  // check if frequent calls to `browser.storage.local.set` waste hard drives?
  function updateStorage(storage: typeof browser.storage['sync' | 'local'], changes: MyStorageChanges) {
    const items: Partial<Settings> = {};
    for (const [key, change] of Object.entries(changes)) {
      (items[key as keyof Settings] as any) = change!.newValue;
    }
    storage.set(items);
  }
  // Why `MAX_WRITE_OPERATIONS_PER_HOUR`, not `MAX_WRITE_OPERATIONS_PER_MINUTE`? Because it has smaller throughput,
  // therefore, if this one is not exceeded, the other one isn't exceeded either.
  // There may not be `chrome` and there may not be `.MAX_WRITE_OPERATIONS_PER_HOUR`.
  const MAX_WRITE_OPERATIONS_PER_HOUR = chrome?.storage.sync.MAX_WRITE_OPERATIONS_PER_HOUR ?? 2000;
  const throttleWait = 1000 * 60 * 60 / MAX_WRITE_OPERATIONS_PER_HOUR;
  const throttledUpdateStorage = throttle(updateStorage, throttleWait);
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (BUILD_DEFINITIONS.BROWSER !== 'chromium') {
      changes = filterOutUnchangedValues(changes);
      if (Object.keys(changes).length === 0) {
        return;
      }
    }

    switch (areaName) {
      case 'local': {
        throttledUpdateStorage(browser.storage.sync, changes);
        break;
      }
      case 'sync': {
        // In case sync settings have been changed on another synced device.
        // TODO check if this the update that we've just pushed there and if so, do nothing? Idempotence token? Too much
        // hassle, this is already a workaround.
        updateStorage(browser.storage.local, changes);
        break;
      }
    }
  })

  initBrowserHotkeysListener();

  initIconAndBadgeUpdater();
})();
