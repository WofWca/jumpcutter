import type TimeSavedTracker from "@/entry-points/content/TimeSavedTracker";

export function getTimeSavedComparedToSoundedSpeedFraction(
  s: TimeSavedTracker["timeSavedData"]
): number {
  return (
    s.timeSavedComparedToSoundedSpeed /
    (s.wouldHaveLastedIfSpeedWasSounded || Number.MIN_VALUE)
  );
}
export function getTimeSavedComparedToIntrinsicSpeedFraction(
  s: TimeSavedTracker["timeSavedData"]
): number {
  return (
    s.timeSavedComparedToIntrinsicSpeed /
    (s.wouldHaveLastedIfSpeedWasIntrinsic || Number.MIN_VALUE)
  );
}
