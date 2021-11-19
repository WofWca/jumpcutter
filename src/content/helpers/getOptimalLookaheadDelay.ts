import type { TimeDelta } from '@/helpers';

/**
 * Mathematically minimal lookahead delay which is required for marginBefore to work.
 */
function getMinLookaheadDelay(intrinsicTimeMargin: TimeDelta, soundedSpeed: number, silenceSpeed: number): TimeDelta {
  return intrinsicTimeMargin / Math.max(soundedSpeed, silenceSpeed);
}
export function getOptimalLookaheadDelay(...args: Parameters<typeof getMinLookaheadDelay>): TimeDelta {
  // If we were to use `getMinLookaheadDelay`, it would mean that we basically need to instantly start stretching as
  // soon as we get `SilenceDetectorEventType.SILENCE_END` from `Controller._silenceDetectorNode`, but this is not a
  // perfect world and code cannot be executed instantly, so `StretcherAndPitchCorrectorNode.stretch` ends up getting
  // called with `startTime < context.currentTime`, which ultimately causes glitches.
  // Introducting additional delay allows us to schedule stretcher things for a bit later.
  // Basically set this as low as you can without getting warnings from `StretcherAndPitchCorrectorNode` (not just on
  // your PC, ofc). TODO maybe put this in settings?
  const codeExecutionMargin: TimeDelta = 0.01;

  return getMinLookaheadDelay(...args) + codeExecutionMargin;
}
