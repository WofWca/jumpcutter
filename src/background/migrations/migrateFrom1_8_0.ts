import browser from '@/webextensions-api';
import { Settings } from "@/settings";

export default async function (): Promise<void> {
  const storage = browser.storage.local;
  const defaults = {
    silenceSpeed: 4,
    soundedSpeed: 1.5,
    enableExperimentalFeatures: true,
  };
  const { silenceSpeed, soundedSpeed, enableExperimentalFeatures } = await storage.get(defaults) as typeof defaults;
  let multiplier = silenceSpeed / soundedSpeed;
  if (!(0 < multiplier && multiplier <= 10)) { // Check if it's reasonable (and if it's a nubmer at all, just in case).
    multiplier = 2;
  }
  const newValues: Partial<Settings> = {
    silenceSpeedSpecificationMethod: 'relativeToSoundedSpeed',
    silenceSpeedRaw: multiplier,
  }
  if (enableExperimentalFeatures === false) {
    // Since the new version, this is practically equivalent.
    newValues.marginBefore = 0;
  }
  await storage.remove(['silenceSpeed', 'enableExperimentalFeatures']);
  await storage.set(newValues);
}
