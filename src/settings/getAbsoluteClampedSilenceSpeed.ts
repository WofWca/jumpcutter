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
