import type { TimeDelta } from '@/helpers';
import { getStretcherDelayChange } from './getStretcherDelayChange';

// TODO Is it always constant though? What about these short silence snippets, where we don't have to fully reset the margin?
export function getStretcherSoundedDelay(
  intrinsicTimeMarginBefore: TimeDelta,
  soundedSpeed: number,
  silenceSpeed: number
): TimeDelta {
  const realTimeMarginBefore = intrinsicTimeMarginBefore / silenceSpeed;
  const delayChange = getStretcherDelayChange(realTimeMarginBefore, silenceSpeed, soundedSpeed);
  return 0 + delayChange;
}
