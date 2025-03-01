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

// TODO split this script so its unused parts can be unloaded. If I understand it correctly.
// https://developer.chrome.com/extensions/background_pages#unloading
// 1. migrations
// 2. settings saving.
import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';

import { onCommand as onCommandWhenReady } from './browserHotkeysListener';
import {
  initIconAndBadge,
  onNewTimeSavedInfo,
  updateIconAndBadge
} from './iconAndBadgeUpdater';
import { storage } from '@/settings/_storage';
import {
  ControllerKind_CLONING,
  createWrapperListener,
  getSettings,
  settingsChanges2NewValues,
} from "@/settings";
import type { Settings } from '@/settings';
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
settingsP.then(s => {
  // FYI the script registration might already be in the desired state
  // since the last time the background script was running.
  updateMediaSourceCloningScriptRegistered(s);
})
const onStorageChanged = createWrapperListener(async changes => {
  const settings = await settingsP;
  // Yes, every time this function executes, `await settingsP` is the same
  // object, so mutations to it persist.
  Object.assign(settings, settingsChanges2NewValues(changes));

  if (changes.experimentalControllerType || changes.enabled) {
    updateMediaSourceCloningScriptRegistered(settings);
  }

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

browserOrChrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'timeSavedBadgeText') {
    console.warn(
      'received connection, but port name is unknown. Ignoring.',
      port.name
    );
    // port.disconnect()
    return;
  }

  const senderTabId = port.sender?.tab?.id;
  if (senderTabId == undefined) {
    console.warn(`received ${port.name}, but tab.id is not set. Ignoring`);
    // port.disconnect()
    return
  }

  let settings: undefined | Awaited<typeof settingsP> = undefined
  port.onMessage.addListener(async (timeSavedString) => {
    if (typeof timeSavedString !== 'string') {
      console.warn(
        port.name,
        'sent a message',
        timeSavedString,
        'but we expected a string',
      );
      return;
    }

    if (settings == undefined) {
      settings = await settingsP
    }

    if (settings.badgeWhatSettingToDisplayByDefault !== 'timeSaved') {
      console.warn(
        'Received timeSavedBadgeText message, but `settings.badgeWhatSettingToDisplayByDefault` is',
        settings.badgeWhatSettingToDisplayByDefault,
        'This is expected if the setting value got changed but the page has not been reloaded'
      )
      return
    }

    onNewTimeSavedInfo(senderTabId, timeSavedString)
  })
});

async function updateMediaSourceCloningScriptRegistered(
  settings: Pick<Settings, "enabled" | "experimentalControllerType">
) {
  // TODO fix: this function is async, probably won't work well
  // if the related setting change rapidly. Though it's rare.
  const needsToBeRegistered =
    settings.experimentalControllerType === ControllerKind_CLONING &&
    settings.enabled;
  const isRegistered =
    (
      await browserOrChrome.scripting.getRegisteredContentScripts({
        ids: [cloneMediaSourcesScriptId],
      })
    ).length > 0;

  if (isRegistered === needsToBeRegistered) {
    if (IS_DEV_MODE) {
      console.log(
        `\`cloneMediaSources\` content script is already` +
          ` ${isRegistered ? "" : "un"}registered, keeping it this way`
      );
    }

    return;
  }

  if (needsToBeRegistered) {
    IS_DEV_MODE &&
      console.log("Registering `cloneMediaSources` content script");

    await browserOrChrome.scripting.registerContentScripts([
      {
        id: cloneMediaSourcesScriptId,
        matches: ["http://*/*", "https://*/*"],
        js: ["content/cloneMediaSources-for-extension-world.js"],
        runAt: "document_start",
        persistAcrossSessions: true,

        allFrames: true,
        // Apparently there is no `match_about_blank`, but this is its
        // replacement, although I suppose it's not exactly the same:
        // https://developer.chrome.com/docs/extensions/reference/api/scripting#type-RegisteredContentScript
        // > Indicates whether the script can be injected into frames
        // > where the URL contains an unsupported scheme;
        // > specifically: about:, data:, blob:, or filesystem:.
        //
        // It's going to be available in Gecko since version 128:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1853411
        // which comes out on 2024-07-09:
        // https://whattrainisitnow.com/calendar/
        // But let's not mark `strict_min_version`, because the extension
        // is still usable without `matchOriginAsFallback`.
        ...(
          (
            BUILD_DEFINITIONS.BROWSER === "gecko" &&
            !(await doesGeckoSupportMatchOriginAsFallback())
          )
            ? {}
            : { matchOriginAsFallback: true }
        ),

        // TODO improvement: add `world: 'MAIN'` and load the
        // `content/cloneMediaSources-for-page-world.js` script directly.
        // See comments about "world" in `cloneMediaSources-for-extension-world`
      },
    ]);
  } else {
    IS_DEV_MODE &&
      console.log("Unregistering `cloneMediaSources` content script");

    await browserOrChrome.scripting.unregisterContentScripts({
      ids: [cloneMediaSourcesScriptId],
    });
  }
}
const cloneMediaSourcesScriptId = 'cloneMediaSources';

async function doesGeckoSupportMatchOriginAsFallback(): Promise<boolean> {
  const version = (
    await import(
      /* webpackExports: ['getGeckoMajorVersion']*/
      "@/helpers"
    )
  ).getGeckoMajorVersion();
  return version == undefined || version >= 128;
}
