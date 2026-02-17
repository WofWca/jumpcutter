import { describe, expect, it } from 'vitest';
import { decidePlaybackRatePolicy } from '../src/entry-points/content/helpers/playbackRatePolicy';
import { shouldForceSoundedSpeed } from '../src/entry-points/content/helpers/stuckSpeedRecovery';

describe('playback rate ownership policy', () => {
  it('adopts external rate in update mode', () => {
    const decision = decidePlaybackRatePolicy({
      mode: 'updateSoundedSpeed',
      forcePrevent: false,
      currentPlaybackRate: 1.8,
      lastPlaybackRateSetByExtension: 1.5,
    });
    expect(decision).toBe('adopt-external-rate');
  });

  it('prevents external rate change in prevent mode', () => {
    const decision = decidePlaybackRatePolicy({
      mode: 'prevent',
      forcePrevent: false,
      currentPlaybackRate: 2,
      lastPlaybackRateSetByExtension: 1.25,
    });
    expect(decision).toBe('prevent-change');
  });

  it('ignores when no external change is detected', () => {
    const decision = decidePlaybackRatePolicy({
      mode: 'updateSoundedSpeed',
      forcePrevent: false,
      currentPlaybackRate: 1.5,
      lastPlaybackRateSetByExtension: 1.5,
    });
    expect(decision).toBe('ignore');
  });
});

describe('stuck speed recovery', () => {
  it('forces sounded speed when speed is elevated for too long', () => {
    const shouldRecover = shouldForceSoundedSpeed({
      nowMs: 5000,
      lastRateChangeAtMs: 1000,
      currentPlaybackRate: 3,
      soundedSpeed: 1.2,
      elementPaused: false,
      minimumStuckDurationMs: 3000,
    });
    expect(shouldRecover).toBe(true);
  });

  it('does not recover if element is paused', () => {
    const shouldRecover = shouldForceSoundedSpeed({
      nowMs: 5000,
      lastRateChangeAtMs: 1000,
      currentPlaybackRate: 3,
      soundedSpeed: 1.2,
      elementPaused: true,
      minimumStuckDurationMs: 3000,
    });
    expect(shouldRecover).toBe(false);
  });
});
