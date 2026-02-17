import { describe, expect, it } from 'vitest';
import {
  getTimeSavedComparedToIntrinsicSpeedFraction,
  getTimeSavedComparedToSoundedSpeedFraction,
} from '../src/helpers/timeSavedMath';

describe('time saved math', () => {
  it('computes time saved fraction against sounded speed', () => {
    const fraction = getTimeSavedComparedToSoundedSpeedFraction({
      timeSavedComparedToSoundedSpeed: 30,
      wouldHaveLastedIfSpeedWasSounded: 120,
      timeSavedComparedToIntrinsicSpeed: 0,
      wouldHaveLastedIfSpeedWasIntrinsic: 0,
    } as any);
    expect(fraction).toBeCloseTo(0.25);
  });

  it('computes time saved fraction against intrinsic speed', () => {
    const fraction = getTimeSavedComparedToIntrinsicSpeedFraction({
      timeSavedComparedToSoundedSpeed: 0,
      wouldHaveLastedIfSpeedWasSounded: 0,
      timeSavedComparedToIntrinsicSpeed: 50,
      wouldHaveLastedIfSpeedWasIntrinsic: 200,
    } as any);
    expect(fraction).toBeCloseTo(0.25);
  });

  it('does not return NaN on zero denominator', () => {
    const fraction = getTimeSavedComparedToIntrinsicSpeedFraction({
      timeSavedComparedToSoundedSpeed: 0,
      wouldHaveLastedIfSpeedWasSounded: 0,
      timeSavedComparedToIntrinsicSpeed: 0,
      wouldHaveLastedIfSpeedWasIntrinsic: 0,
    } as any);
    expect(Number.isNaN(fraction)).toBe(false);
  });
});
