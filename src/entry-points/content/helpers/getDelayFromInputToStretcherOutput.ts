import type { TimeDelta } from '@/helpers';

export function getDelayFromInputToStretcherOutput(
  lookaheadNodeDelay: TimeDelta,
  stretcherNodeDelay: TimeDelta
): TimeDelta {
  return lookaheadNodeDelay + stretcherNodeDelay;
}
