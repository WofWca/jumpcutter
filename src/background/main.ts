// TODO split this script so its unused parts can be unloaded. If I understand it correctly.
// https://developer.chrome.com/extensions/background_pages#unloading
// 1. migrations
// 2. settings saving.
import browser from 'webextension-polyfill';

import runRequiredMigrations from './migrations/runRequiredMigrations';

import initBrowserHotkeysListener from './initBrowserHotkeysListener';
import initIconAndBadgeUpdater from './initIconAndBadgeUpdater';

import throttle from 'lodash/throttle';
import type { Settings, MyStorageChanges } from '@/settings';

// Run migrations.
browser.runtime.onInstalled.addListener(async details => {
  if (details.reason !== 'update') return;
  await runRequiredMigrations(details.previousVersion!);
})

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
const MAX_WRITE_OPERATIONS_PER_HOUR = chrome ? chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_HOUR : 2000;
const throttleWait = 1000 * 60 * 60 / MAX_WRITE_OPERATIONS_PER_HOUR;
const throttledUpdateStorage = throttle(updateStorage, throttleWait);
browser.storage.onChanged.addListener((changes, areaName) => {
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
