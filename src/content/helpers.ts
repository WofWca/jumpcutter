import type { Time, StretchInfo } from '@/helpers';

export function getRealtimeMargin(margin: Time, speed: number): Time {
  return margin / speed;
}

export function getNewLookaheadDelay(videoTimeMargin: Time, soundedSpeed: number, silenceSpeed: number): Time {
  return videoTimeMargin / Math.min(soundedSpeed, silenceSpeed)
}
export function getTotalDelay(lookaheadNodeDelay: Time, stretcherNodeDelay: Time): Time {
  return lookaheadNodeDelay + stretcherNodeDelay;
}
export function getNewSnippetDuration(originalRealtimeDuration: Time, originalSpeed: number, newSpeed: number): Time {
  const videoSpeedSnippetDuration = originalRealtimeDuration * originalSpeed;
  return videoSpeedSnippetDuration / newSpeed;
}
// The delay that the stretcher node is going to have when it's done slowing down a snippet
export function getStretcherDelayChange(
  snippetOriginalRealtimeDuration: Time,
  originalSpeed: number,
  newSpeed: number
): Time {
  const snippetNewDuration = getNewSnippetDuration(snippetOriginalRealtimeDuration, originalSpeed, newSpeed);
  const delayChange = snippetNewDuration - snippetOriginalRealtimeDuration;
  return delayChange;
}
// TODO Is it always constant though? What about these short silence snippets, where we don't have to fully reset the margin?
export function getStretcherSoundedDelay(
  videoTimeMarginBefore: Time,
  soundedSpeed: number,
  silenceSpeed: number
): Time {
  const realTimeMarginBefore = videoTimeMarginBefore / silenceSpeed;
  const delayChange = getStretcherDelayChange(realTimeMarginBefore, silenceSpeed, soundedSpeed);
  return 0 + delayChange;
}
export function getStretchSpeedChangeMultiplier(
  { startValue, endValue, startTime, endTime }: Pick<StretchInfo, 'startValue' | 'endValue' | 'startTime' | 'endTime'>
): number {
  return ((endTime - startTime) + (startValue - endValue)) / (endTime - startTime);
}

/**
 * The holy grail of this algorithm.
 * Answers the question "When is the sample that has been on the input at `momentTime` going to appear on the output?"
 * Contract:
 * * Only works for input values such that the correct answer is after the `lastScheduledStretcherDelayReset`'s start time.
 * * Assumes the video is never played backwards (i.e. stretcher delay never so quickly).
 */
export function getMomentOutputTime(
  momentTime: Time,
  lookaheadDelay: Time,
  lastScheduledStretcherDelayReset: StretchInfo
): Time {
  const stretch = lastScheduledStretcherDelayReset;
  const stretchEndTotalDelay = getTotalDelay(lookaheadDelay, stretch.endValue);
  // Simpliest case. The target moment is after the `stretch`'s end time
  // TODO DRY `const asdadsd = momentTime + stretchEndTotalDelay;`?
  if (momentTime + stretchEndTotalDelay >= stretch.endTime) {
    return momentTime + stretchEndTotalDelay;
  } else {
    // `lastScheduledStretcherDelayReset` is going to be in progress when the target moment is on the output.

    // At which point between its start and end would the target moment be played if we were to not actually change the
    // delay ?
    const originalTargetMomentOffsetRelativeToStretchStart =
      momentTime + getTotalDelay(lookaheadDelay, stretch.startValue) - stretch.startTime;
    // By how much the snippet is going to be stretched?
    const playbackSpeedupDuringStretch = getStretchSpeedChangeMultiplier(stretch);
    // How much time will pass since the stretch start until the target moment is played on the output?
    const finalTargetMomentOffsetRelativeToStretchStart =
      originalTargetMomentOffsetRelativeToStretchStart / playbackSpeedupDuringStretch;
    return stretch.startTime + finalTargetMomentOffsetRelativeToStretchStart;
  }
}

/**
 * Chromium uses different audio data pipelines for normal (1.0) and non-normal speeds, and
 * switching between them causes an audio glitch:
 * https://github.com/chromium/chromium/blob/8af9895458f5ac16b2059ca8a336da6367188409/media/renderers/audio_renderer_impl.h#L16-L17
 * This is to make it impossible for the user to set speed to no normal.
 * TODO give users an option (on the options page) to skip this transformation.
 */
export function transformSpeed(speed: number): number {
  // On Chromium 86.0.4240.99, it appears that 1.0 is not the only "normal" speed. It's a small proximity of 1.0.
  //
  // It's not the smallest, but a value close to the smallest value for which the audio
  // stream start going through the stretcher algorithm. Determined from a bit of experimentation.
  // TODO DRY this, as it may change.
  const smallestNonNormalAbove1 = 1.00105;
  // Actually I'm not sure if there's such a relation between the biggest and the smallest.
  const biggestNonNormalBelow1 = 1 - (smallestNonNormalAbove1 - 1);

  if (biggestNonNormalBelow1 < speed && speed < smallestNonNormalAbove1) {
    return smallestNonNormalAbove1 - speed < speed - biggestNonNormalBelow1
      ? biggestNonNormalBelow1
      : smallestNonNormalAbove1;
  }
  return speed;
}
