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
