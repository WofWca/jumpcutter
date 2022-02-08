import once from 'lodash/once';
import { getGeckoMajorVersion } from './';

// Firefox < 97 mutes media elements whose `playbackRate > 4`:
// https://hg.mozilla.org/mozilla-central/file/9ab1bb831b50bc4012153f51a75389995abebc1d/dom/html/HTMLMediaElement.cpp#l182
// For Firefox >= 97 this threshold is defined by `media.audio.playbackrate.muting_threshold` of `about:config`.
// https://bugzilla.mozilla.org/show_bug.cgi?id=1630569#c15
// TODO but this doesn't check the value of that option (hence the word "likely" in the name).
// Add an extension setting called something like `maxPlaybackRate`, in case `muting_threshold` is different from 8?
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
