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

import { getGeckoLikelyMaxNonMutedPlaybackRate } from '@/helpers';
import type { Settings } from './';

// In Chromium the max value is 16 and when you assign to `.playbackRate` a higher value, it throws
// (https://html.spec.whatwg.org/multipage/media.html#dom-media-playbackrate),
// https://github.com/chromium/chromium/blob/46326599815cf2577efd7479d36946ea4a649083/third_party/blink/renderer/core/html/media/html_media_element.cc#L169-L171
// TODO This is a temporary measure to avoid this - the user can still set higher playbackRate
// (e.g. by setting `soundedSpeed` to 2 & `silenceSpeedRaw` to 2.5), but he will be confused why it's capped at 4.
// Also browser may change these values in the future. Add a setting? Or add `try ... catch` to where
// we assign to `.playbackRate`?
const maxPlaybackRate = BUILD_DEFINITIONS.BROWSER === 'gecko'
  ? getGeckoLikelyMaxNonMutedPlaybackRate()
  : 16;

export function getAbsoluteClampedSilenceSpeed(
  settings: Pick<Settings, 'silenceSpeedRaw' | 'silenceSpeedSpecificationMethod' | 'soundedSpeed'>
): number {
  let val = settings.silenceSpeedSpecificationMethod === 'relativeToSoundedSpeed'
    ? settings.silenceSpeedRaw * settings.soundedSpeed
    : settings.silenceSpeedRaw;

  if (val > maxPlaybackRate) {
    val = maxPlaybackRate;
  }
  return val;
}
