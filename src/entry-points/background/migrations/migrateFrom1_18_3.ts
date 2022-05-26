import browser from '@/webextensions-api';
import { defaultSettings, Settings } from '@/settings';

export default async function (): Promise<void> {
  const {
    popupChartLengthInSeconds,
    soundedSpeed,
  } = await browser.storage.local.get(['popupChartLengthInSeconds', 'soundedSpeed']);

  const newValues: Partial<Settings> = {};

  // A fix of the faulty `migrateFrom1_16_7.ts`. There `popupChartLengthInSeconds` could be
  // missing in the storage if the `previousVersion` is an old one, which would reslt in `popupChartLengthInSeconds`
  // becoming `NaN`.
  if (!Number.isFinite(popupChartLengthInSeconds)) {
    newValues.popupChartLengthInSeconds = defaultSettings.popupChartLengthInSeconds
  }

  // A fix for the faulty `migrateFrom1_18_2.ts`. There `popupSoundedSpeedStep` could be missing from the storage so
  // if `soundedSpeed` was 0 (which was possible to make it so in `1.0.0`) it would become `undefined`.
  // Why don't we also try to fix `popupSoundedSpeedMin`? Because if `popupSoundedSpeedMin` is 0, this means that
  // `popupSoundedSpeedStep` is not missing because these keys were added in the same version and we write
  // default settings to storage upon their addition (see `setNewSettingsKeysToDefaults`).
  if (soundedSpeed === undefined) {
    newValues.soundedSpeed = defaultSettings.soundedSpeed;
  }

  await browser.storage.local.set(newValues);
}
