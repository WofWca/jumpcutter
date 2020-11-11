import { Settings } from "@/settings";

export default async function (): Promise<void> {
  const storage = chrome.storage.local;
  const { silenceSpeed, soundedSpeed, enableExperimentalFeatures } =
    await new Promise(r => storage.get(['silenceSpeed', 'soundedSpeed', 'enableExperimentalFeatures'], r as any));
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
  storage.remove(['silenceSpeed', 'enableExperimentalFeatures']);
  storage.set(newValues);
}
