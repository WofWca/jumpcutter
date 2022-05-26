import type { AudioContextTime, StretchInfo, TimeDelta } from '@/helpers';
import { getStretchSpeedChangeMultiplier } from './getStretchSpeedChangeMultiplier';
import { getDelayFromInputToStretcherOutput } from './getDelayFromInputToStretcherOutput';

/**
 * The holy grail of the stretching algorithm.
 * Answers the question "When is the sample that has been on the input at `momentTime` going to appear
 * on the output of the stretcher's delay node?" This means it takes into account lookahead delay and
 * stretcher `delayNode`'s delay, but not pitch corrector's delay.
 * Contract:
 * * Only works for input values such that the correct answer is after the `lastScheduledStretcherDelayReset`'s start time.
 * * Assumes the video is never played backwards (i.e. stretcher delay never so quickly).
 */
export function getWhenMomentGetsToStretchersDelayNodeOutput(
  momentTime: AudioContextTime,
  lookaheadDelay: TimeDelta,
  lastScheduledStretcherDelayReset: StretchInfo
): AudioContextTime {
  const stretch = lastScheduledStretcherDelayReset;
  const stretchEndTotalDelay = getDelayFromInputToStretcherOutput(lookaheadDelay, stretch.endValue);
  // Simpliest case. The target moment is after the `stretch`'s end time
  // TODO DRY `const asdadsd = momentTime + stretchEndTotalDelay;`?
  if (momentTime + stretchEndTotalDelay >= stretch.endTime) {
    return momentTime + stretchEndTotalDelay;
  } else {
    // `lastScheduledStretcherDelayReset` is going to be in progress when the target moment is on the output.

    // At which point between its start and end would the target moment be played if we were to not actually change the
    // delay ?
    const originalTargetMomentOffsetRelativeToStretchStart =
      momentTime + getDelayFromInputToStretcherOutput(lookaheadDelay, stretch.startValue) - stretch.startTime;
    // By how much the snippet is going to be stretched?
    const playbackSpeedupDuringStretch = getStretchSpeedChangeMultiplier(stretch);
    // How much time will pass since the stretch start until the target moment is played on the output?
    const finalTargetMomentOffsetRelativeToStretchStart =
      originalTargetMomentOffsetRelativeToStretchStart / playbackSpeedupDuringStretch;
    return stretch.startTime + finalTargetMomentOffsetRelativeToStretchStart;
  }
}
