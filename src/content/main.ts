import { enabledSettingDefaultValue, MyStorageChanges, Settings } from '@/settings';
import { mainStorageAreaName } from '@/settings/mainStorageAreaName';

(async function () { // Just for top-level `await`

async function importAndInit() {
  const { default: init } = await import(
    /* webpackExports: ['default'] */
    './init'
  )
  init();
}

// In Chromium, compared to `getSettings(`, this function does not require the whole `browser` API polyfill.
async function isEnabled(): Promise<boolean> {
  const keys: Partial<Settings> = { enabled: enabledSettingDefaultValue } as const;
  const p = typeof browser !== 'undefined'
    ? browser.storage.local.get(keys) as Promise<Settings>
    : new Promise(r => chrome.storage.local.get(keys, r as (s: Record<string, any>) => void)) as Promise<Settings>;
  const { enabled } = await p;
  return enabled;
}

if (process.env.NODE_ENV !== 'production') {
  Promise.all([
    import(
      /* webpackExports: ['storage']*/
      '@/settings/_storage'
    ),
    import(
      /* webpackExports: ['default']*/
      '@/webextensions-api'
    ),
  ]).then(([
    { storage },
    { default: browser },
  ]) => {
    if (browser.storage.local !== storage) {
      console.error('Looks like you\'ve changed the default storage and `isEnabled` will not work as intended.'
        + ' If you don\'t know what to do, just revert this commit.');
    }
  });
}

const enabledOnInitialization = await isEnabled();
if (enabledOnInitialization) {
  importAndInit();
}
// Not using `addOnSettingsChangedListener` from '@/settings' because it's heavy because of `filterOutUnchangedValues`.
// TODO use it when (if?) it's gone.
(typeof browser !== 'undefined' ? browser : chrome).storage.onChanged.addListener(function (changes: MyStorageChanges, areaName) {
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
