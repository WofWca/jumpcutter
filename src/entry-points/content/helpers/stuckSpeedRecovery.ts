export interface StuckSpeedRecoveryInput {
  nowMs: number;
  lastRateChangeAtMs: number;
  currentPlaybackRate: number;
  soundedSpeed: number;
  elementPaused: boolean;
  minimumStuckDurationMs: number;
}

export function shouldForceSoundedSpeed(input: StuckSpeedRecoveryInput): boolean {
  if (input.elementPaused) {
    return false;
  }
  if (input.currentPlaybackRate <= input.soundedSpeed + 0.01) {
    return false;
  }
  return (input.nowMs - input.lastRateChangeAtMs) >= input.minimumStuckDurationMs;
}
