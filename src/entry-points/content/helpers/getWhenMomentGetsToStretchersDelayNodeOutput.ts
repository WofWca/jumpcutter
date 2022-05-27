/**
 * @license
 * Copyright (C) 2021, 2022  WofWca <wofwca@protonmail.com>
 *
 * This file is part of Jump Cutter Browser Extension.
 *
 * Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jump Cutter Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
 */

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
