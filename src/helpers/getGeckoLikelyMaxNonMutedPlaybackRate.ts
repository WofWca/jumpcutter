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

import once from 'lodash/once';
import { getGeckoMajorVersion } from './';

// Firefox < 97 mutes media elements whose `playbackRate > 4`:
// https://hg.mozilla.org/mozilla-central/file/9ab1bb831b50bc4012153f51a75389995abebc1d/dom/html/HTMLMediaElement.cpp#l182
// For Firefox >= 97 this threshold is defined by `media.audio.playbackrate.muting_threshold` of `about:config`.
// https://bugzilla.mozilla.org/show_bug.cgi?id=1630569#c15
// TODO improvement: but this doesn't check the value of that option (hence the word "likely" in the name).
// Add an extension setting called something like `maxPlaybackRate`, in case `muting_threshold` is different from 8?
// Or we could make a dummy media element with dummy sound (maybe through Web Audio API?) and keep
// increasing `playbackRate` until we observe it getting muted.
// Or we could ask Gecko devs to make this value available through JS.
function _getGeckoLikelyMaxNonMutedPlaybackRate() {
  const geckoMajorVersion = getGeckoMajorVersion();
  return (
    !geckoMajorVersion
    || geckoMajorVersion >= 97
    // Sanity check, in case there were drastic changes to the `navigator.userAgent` format.
    || geckoMajorVersion <= 2
  )
    ? 8
    : 4;
}
// Memoized. Why not `lodash/memoize`? Because that's heavier.
export const getGeckoLikelyMaxNonMutedPlaybackRate = once(_getGeckoLikelyMaxNonMutedPlaybackRate);
