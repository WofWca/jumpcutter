import browser from '@/webextensions-api';
import { enabledSettingDefaultValue, getSettingsAdvanced, MyStorageChanges } from '@/settings';
import { mainStorageAreaName } from '@/settings/mainStorageAreaName';

(async function () { // Just for top-level `await`

async function importAndInit() {
  const { default: init } = await import(
    /* webpackExports: ['default'] */
    './init'
  )
  init();
}

const { enabled: enabledOnInitialization } = await getSettingsAdvanced({ enabled: enabledSettingDefaultValue });
if (enabledOnInitialization) {
  importAndInit();
}
// Watch the `enabled` setting. Other settings changes are handled by `reactToSettingsChanges`.
// Not using `addOnSettingsChangedListener` from '@/settings' because it's heavy because of `filterOutUnchangedValues`.
// TODO use it when (if?) it's gone.
browser.storage.onChanged.addListener(function (changes: MyStorageChanges, areaName) {
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
