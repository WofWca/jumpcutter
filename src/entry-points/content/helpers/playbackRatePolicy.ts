export type PlaybackRateOwnershipMode = 'prevent' | 'updateSoundedSpeed' | 'doNothing';

export interface PlaybackRatePolicyInput {
  mode: PlaybackRateOwnershipMode;
  forcePrevent: boolean;
  currentPlaybackRate: number;
  lastPlaybackRateSetByExtension?: number;
}

export type PlaybackRatePolicyDecision = 'ignore' | 'prevent-change' | 'adopt-external-rate';

export function decidePlaybackRatePolicy(input: PlaybackRatePolicyInput): PlaybackRatePolicyDecision {
  const effectiveMode: PlaybackRateOwnershipMode = input.forcePrevent ? 'prevent' : input.mode;
  if (effectiveMode === 'doNothing') {
    return 'ignore';
  }

  const changedByExternalScript =
    input.lastPlaybackRateSetByExtension !== undefined &&
    input.currentPlaybackRate !== input.lastPlaybackRateSetByExtension;

  if (!changedByExternalScript) {
    return 'ignore';
  }

  if (effectiveMode === 'prevent') {
    return 'prevent-change';
  }

  return 'adopt-external-rate';
}
