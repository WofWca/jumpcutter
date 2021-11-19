import type { TimeDelta } from '@/helpers';

export function getTotalOutputDelay(
  lookaheadNodeDelay: TimeDelta,
  stretcherDelay: TimeDelta,
  pitchCorrectorDelay: TimeDelta
): TimeDelta {
  return lookaheadNodeDelay + stretcherDelay + pitchCorrectorDelay;
}