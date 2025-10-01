import { addOnStorageChangedListener, type Settings } from "@/settings";
import type TimeSavedTracker from "./TimeSavedTracker";

/**
 * Starts tracking how much time we're saving on {@linkcode el},
 * and invoking {@linkcode setSettings_} when the values should be stored
 * to persistent storage.
 *
 * @param settings Live (constantly updated) settings object.
 * It should be updated synchronously inside {@linkcode setSettings_},
 * as well as when the storage gets updated by other scripts.
 */
export default function startTrackingLifetimeTimeSaved(
  el: HTMLMediaElement,
  settings: Pick<
    Settings,
    | "soundedSpeed"
    | "lifetimeTimeSavedComparedToSoundedSpeed"
    | "lifetimeTimeSavedComparedToIntrinsicSpeed"
    | "lifetimeWouldHaveLastedIfSpeedWasSounded"
    | "lifetimeWouldHaveLastedIfSpeedWasIntrinsic"
  >,
  setSettings_: (
    newValues: Partial<
      Pick<
        Settings,
        | "lifetimeTimeSavedComparedToSoundedSpeed"
        | "lifetimeTimeSavedComparedToIntrinsicSpeed"
        | "lifetimeWouldHaveLastedIfSpeedWasSounded"
        | "lifetimeWouldHaveLastedIfSpeedWasIntrinsic"
      >
    >
  ) => void,
  TimeSavedTracker_: typeof TimeSavedTracker,
  onStop: (callback: () => void) => void
): {
  getLifetimeTimeSaved: () => TimeSavedTracker["timeSavedData"];
  onSilenceSkippingSeek: TimeSavedTracker["onSilenceSkippingSeek"];
} {
  const TimeSavedTracker = TimeSavedTracker_;

  const wrapperAddOnSettingsChangedListener: ConstructorParameters<
    typeof TimeSavedTracker
  >[2] = (listener) => {
    // A wrapper listener that ignores changes
    // to the `timeSavedAveragingMethod` setting,
    // so that the `TimeSavedTracker` always remains in the "all-time" mode.
    return addOnStorageChangedListener((changes) => {
      delete changes.timeSavedAveragingMethod;
      listener(changes);
    });
  };

  const timeSavedTracker = new TimeSavedTracker(
    el,
    {
      timeSavedAveragingMethod: "all-time",
      soundedSpeed: settings.soundedSpeed,

      // These are irrelevant for the 'all-time' averaging method.
      timeSavedAveragingWindowLength: 42,
      timeSavedExponentialAveragingLatestDataWeight: 0.42,
    },
    wrapperAddOnSettingsChangedListener
  );
  const startedTrackingAtMs = Date.now();
  const onStopDestroyTracker = () => onStop(() => timeSavedTracker.destroy());

  /**
   * This refers to the values of the {@linkcode timeSavedTracker}.
   * We could have also initialized this as ` = timeSavedTracker.timeSavedData`,
   * but they'd be slightly above 0 due to some microseconds passing.
   */
  let lastStoredTrackerVals: TimeSavedTracker["timeSavedData"] = {
    timeSavedComparedToIntrinsicSpeed: 0,
    timeSavedComparedToSoundedSpeed: 0,
    wouldHaveLastedIfSpeedWasIntrinsic: 0,
    wouldHaveLastedIfSpeedWasSounded: 0,
  };
  const getLifetimeTimeSaved = (
    savedInCurrSession: TimeSavedTracker["timeSavedData"]
  ) => {
    return {
      // Same calculation for each value.
      timeSavedComparedToIntrinsicSpeed:
        settings.lifetimeTimeSavedComparedToIntrinsicSpeed +
        (savedInCurrSession.timeSavedComparedToIntrinsicSpeed -
          lastStoredTrackerVals.timeSavedComparedToIntrinsicSpeed),
      timeSavedComparedToSoundedSpeed:
        settings.lifetimeTimeSavedComparedToSoundedSpeed +
        (savedInCurrSession.timeSavedComparedToSoundedSpeed -
          lastStoredTrackerVals.timeSavedComparedToSoundedSpeed),
      wouldHaveLastedIfSpeedWasIntrinsic:
        settings.lifetimeWouldHaveLastedIfSpeedWasIntrinsic +
        (savedInCurrSession.wouldHaveLastedIfSpeedWasIntrinsic -
          lastStoredTrackerVals.wouldHaveLastedIfSpeedWasIntrinsic),
      wouldHaveLastedIfSpeedWasSounded:
        settings.lifetimeWouldHaveLastedIfSpeedWasSounded +
        (savedInCurrSession.wouldHaveLastedIfSpeedWasSounded -
          lastStoredTrackerVals.wouldHaveLastedIfSpeedWasSounded),
    };
  };

  const saveToStorage = () => {
    IS_DEV_MODE && console.log('Saving "time saved data" to storage');

    const timeSavedInCurrSession = timeSavedTracker.timeSavedData;

    if (
      timeSavedInCurrSession.timeSavedComparedToIntrinsicSpeed ===
        lastStoredTrackerVals.timeSavedComparedToIntrinsicSpeed &&
      timeSavedInCurrSession.timeSavedComparedToSoundedSpeed ===
        lastStoredTrackerVals.timeSavedComparedToSoundedSpeed &&
      timeSavedInCurrSession.wouldHaveLastedIfSpeedWasIntrinsic ===
        lastStoredTrackerVals.wouldHaveLastedIfSpeedWasIntrinsic &&
      timeSavedInCurrSession.wouldHaveLastedIfSpeedWasSounded ===
        lastStoredTrackerVals.wouldHaveLastedIfSpeedWasSounded
    ) {
      IS_DEV_MODE &&
        console.log(
          "Time saved didn't change since the last time we saved it, skip saving"
        );
      return;
    }

    // Sanity checks. Don't save to storage if the value is insane,
    // in order to not permanently mess up the stored value.
    // Note that the value might be insane at first, but then normalize,
    // and then we'll still save it.
    //
    // TODO reconsider this. This affects performance,
    // but I have basically never seen the "time saved" values being too insane.
    // On top of that, maybe messing up the values is not that bad,
    // as long as we rotate them, say, every month.
    if (!isSessionTimeSavedSane(timeSavedInCurrSession, startedTrackingAtMs)) {
      console.warn(
        "Total time saved doesn't look sane, will not store it to persistent storage",
        timeSavedInCurrSession,
        startedTrackingAtMs
      );
      return;
    }

    const lifetimeSaved = getLifetimeTimeSaved(timeSavedInCurrSession);

    setSettings_({
      lifetimeTimeSavedComparedToIntrinsicSpeed:
        lifetimeSaved.timeSavedComparedToIntrinsicSpeed,
      lifetimeTimeSavedComparedToSoundedSpeed:
        lifetimeSaved.timeSavedComparedToSoundedSpeed,
      lifetimeWouldHaveLastedIfSpeedWasIntrinsic:
        lifetimeSaved.wouldHaveLastedIfSpeedWasIntrinsic,
      lifetimeWouldHaveLastedIfSpeedWasSounded:
        lifetimeSaved.wouldHaveLastedIfSpeedWasSounded,
    });
    lastStoredTrackerVals = timeSavedInCurrSession;
  };

  const onVisibilitychangeListener = () => {
    if (document.visibilityState !== "hidden") {
      return;
    }
    saveToStorage();
    // TODO perf: if the video is not playing, remove the listener
    // until the video starts playing again?
  };
  // Save before potential page close.
  document.addEventListener("visibilitychange", onVisibilitychangeListener);
  onStop(() =>
    document.removeEventListener("visibilitychange", onVisibilitychangeListener)
  );

  onStop(saveToStorage);
  // Call this only after `onDetach(saveToStorage)`,
  onStopDestroyTracker();

  return {
    getLifetimeTimeSaved: () =>
      getLifetimeTimeSaved(timeSavedTracker.timeSavedData),
    onSilenceSkippingSeek: (...args) =>
      timeSavedTracker.onSilenceSkippingSeek(...args),
  };
}

function isSessionTimeSavedSane(
  saved: TimeSavedTracker["timeSavedData"],
  startedTrackingAtMs: number
): boolean {
  const timeSavedComparedtoSoundedFraction =
    saved.timeSavedComparedToSoundedSpeed /
    (saved.wouldHaveLastedIfSpeedWasSounded || Number.MIN_VALUE);
  if (
    timeSavedComparedtoSoundedFraction > 0.95 ||
    timeSavedComparedtoSoundedFraction < -0.5
  ) {
    return false;
  }
  const timeSavedComparedtoIntrinsicFraction =
    saved.timeSavedComparedToIntrinsicSpeed /
    (saved.wouldHaveLastedIfSpeedWasIntrinsic || Number.MIN_VALUE);
  if (
    // Sanity margin for intrinsic speed values is greater
    // than for sounded speed, because the fraction is greater
    // when the sounded speed is high, and is lower, even negative,
    // when the sounded speed is < 1.
    timeSavedComparedtoIntrinsicFraction > 0.99 ||
    timeSavedComparedtoIntrinsicFraction < -10
  ) {
    return false;
  }

  const calculatedAverageSoundedSpeed =
    saved.wouldHaveLastedIfSpeedWasIntrinsic /
    saved.wouldHaveLastedIfSpeedWasSounded;
  if (
    calculatedAverageSoundedSpeed > 16 ||
    calculatedAverageSoundedSpeed < 0.125
  ) {
    return false;
  }

  const realtimePlaybackDurationMs =
    1000 *
    (saved.wouldHaveLastedIfSpeedWasSounded -
      saved.timeSavedComparedToSoundedSpeed);
  const realTimePassedSinceStartedTrackingMs = Date.now() - startedTrackingAtMs;
  // It says that playback lasts much longer than what has really passed.
  if (realtimePlaybackDurationMs > realTimePassedSinceStartedTrackingMs * 2) {
    return false;
  }

  if (
    saved.timeSavedComparedToSoundedSpeed < -1 * 60 * 60 * 24 ||
    saved.timeSavedComparedToSoundedSpeed > 60 * 60 * 24 * 365 ||
    saved.timeSavedComparedToIntrinsicSpeed < -1 * 60 * 60 * 24 ||
    saved.timeSavedComparedToIntrinsicSpeed > 60 * 60 * 24 * 365
  ) {
    return false;
  }

  // TODO check if the entire duration is silence
  // (for non-infinite silence speed).
  // Is it even possible to determine though based on the 4 values we are given?

  return true;
}
