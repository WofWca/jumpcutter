import { Settings } from '@/settings';
import browser from '@/webextensions-api';

// A fix for https://github.com/WofWca/jumpcutter/issues/30
// (make it impossible to set soundedSpeed to 0 using popup inputs).
export default async function (): Promise<void> {
  const {
    popupSoundedSpeedMin,
    popupSoundedSpeedStep,
  } = await browser.storage.local.get(['popupSoundedSpeedMin', 'popupSoundedSpeedStep']);
  if (popupSoundedSpeedMin !== 0) {
    // The user already changed it. So be it.
    return;
  }
  const newValues: Partial<Settings> = {
    popupSoundedSpeedMin: popupSoundedSpeedStep,
  };
  await browser.storage.local.set(newValues);
}
