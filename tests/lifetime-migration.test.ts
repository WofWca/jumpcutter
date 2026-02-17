import { describe, expect, it } from 'vitest';
import { mustResetLifetimeStats } from '../src/entry-points/background/migrations/migrateFrom1_31_0';

describe('lifetime stats migration', () => {
  it('requires reset if any lifetime value is missing or invalid', () => {
    expect(mustResetLifetimeStats({
      lifetimeTimeSavedComparedToSoundedSpeed: 1,
      lifetimeTimeSavedComparedToIntrinsicSpeed: 2,
      lifetimeWouldHaveLastedIfSpeedWasSounded: 3,
      lifetimeWouldHaveLastedIfSpeedWasIntrinsic: NaN,
    })).toBe(true);
  });

  it('does not reset when all values are finite numbers', () => {
    expect(mustResetLifetimeStats({
      lifetimeTimeSavedComparedToSoundedSpeed: 1,
      lifetimeTimeSavedComparedToIntrinsicSpeed: 2,
      lifetimeWouldHaveLastedIfSpeedWasSounded: 3,
      lifetimeWouldHaveLastedIfSpeedWasIntrinsic: 4,
    })).toBe(false);
  });
});
