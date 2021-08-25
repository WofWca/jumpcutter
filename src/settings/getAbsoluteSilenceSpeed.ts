import type { Settings } from './';

export function getAbsoluteSilenceSpeed(settings: Settings): number {
  let val = settings.silenceSpeedSpecificationMethod === 'relativeToSoundedSpeed'
    ? settings.silenceSpeedRaw * settings.soundedSpeed
    : settings.silenceSpeedRaw;

  // In Gecko, when `.playbackRate` is `> 4`, audio gets muted:
  // https://bugzilla.mozilla.org/show_bug.cgi?id=495040
  // https://hg.mozilla.org/mozilla-central/file/9ab1bb831b50bc4012153f51a75389995abebc1d/dom/html/HTMLMediaElement.cpp#l182
  // TODO This is a temporary measure to avoid this - the user can still set higher playbackRate
  // (e.g. by setting `soundedSpeed` to 2 & `silenceSpeedRaw` to 2.5), but he will be confused why it's capped at 4.
  // Also would be cool to disable this behavior in Gecko. TODO.
  if (BUILD_DEFINITIONS.BROWSER === 'gecko') {
    if (val > 4) {
      val = 4;
    }
  }
  return val;
}
