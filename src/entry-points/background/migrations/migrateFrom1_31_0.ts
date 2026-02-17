export function mustResetLifetimeStats(result: Record<string, unknown>): boolean {
  const values = [
    result.lifetimeTimeSavedComparedToSoundedSpeed,
    result.lifetimeTimeSavedComparedToIntrinsicSpeed,
    result.lifetimeWouldHaveLastedIfSpeedWasSounded,
    result.lifetimeWouldHaveLastedIfSpeedWasIntrinsic,
  ];
  return values.some(value => !Number.isFinite(value));
}

export default async function migrateFrom1_31_0(): Promise<void> {
  const area = chrome.storage.local;
  const result = await area.get([
    'lifetimeTimeSavedComparedToSoundedSpeed',
    'lifetimeTimeSavedComparedToIntrinsicSpeed',
    'lifetimeWouldHaveLastedIfSpeedWasSounded',
    'lifetimeWouldHaveLastedIfSpeedWasIntrinsic',
  ]);

  if (!mustResetLifetimeStats(result)) {
    return;
  }

  await area.set({
    lifetimeTimeSavedComparedToSoundedSpeed: 0,
    lifetimeTimeSavedComparedToIntrinsicSpeed: 0,
    lifetimeWouldHaveLastedIfSpeedWasSounded: 0,
    lifetimeWouldHaveLastedIfSpeedWasIntrinsic: 0,
  });
}
