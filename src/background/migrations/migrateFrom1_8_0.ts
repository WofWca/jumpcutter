import { Settings } from "@/settings";

export default async function (): Promise<void> {
  const storage = chrome.storage.local;
  const { silenceSpeed, soundedSpeed } =
    await new Promise(r => storage.get(['silenceSpeed', 'soundedSpeed'], r as any));
  let multiplier = silenceSpeed / soundedSpeed;
  if (!(0 < multiplier && multiplier <= 10)) { // Check if it's reasonable (and if it's a nubmer at all, just in case).
    multiplier = 2;
  }
  const newValues: Partial<Settings> = {
    silenceSpeedSpecificationMethod: 'relativeToSoundedSpeed',
    silenceSpeedRaw: multiplier,
  }
  storage.remove('silenceSpeed');
  storage.set(newValues);
}
