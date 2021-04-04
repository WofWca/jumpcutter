import {
  addOnChangedListener as addOnSettingsChangedListener, enabledSettingDefaultValue, getSettingsAdvanced
} from '@/settings';

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
addOnSettingsChangedListener(function (changes) {
  // Don't need to check if it's already initialized/deinitialized because it's a setting CHANGE, and it's already
  // initialized/deinitialized in accordance to the setting a few lines above.
  if (changes.enabled?.newValue === true) {
    importAndInit();
  }
});

})();
