import { Settings, MyStorageChanges, settingsChanges2NewValues } from "@/settings";
import { addPlaybackStopListener, addPlaybackResumeListener, isPlaybackActive, transformSpeed } from './helpers';
import type { Time } from "@/helpers";

/**
 * Not a typical stopwatch, but close.
 * TODO kind of looks to bloated for our purpose? Just put some development-only warnings on unintended usages instead
 * of handling every case (e.g. getTimeAndReset when it's paused)?
 */
class Stopwatch {
  private _countSinceMs: number;
  private _pausedAtMs: number | null; // `null` when it's not paused.
  constructor() {
    const nowMs = Date.now();
    this._countSinceMs = nowMs;
    this._pausedAtMs = nowMs;
  }

  private _getTime(nowMs: number) {
    return ((this._pausedAtMs ?? nowMs) - this._countSinceMs) / 1000;
  }
  get time(): number {
    return this._getTime(Date.now());
  }
  getTimeAndReset(): number {
    const nowMs = Date.now();
    const timePassed = this._getTime(nowMs);
    this._countSinceMs = nowMs;
    if (this._pausedAtMs) {
      this._pausedAtMs = nowMs;
    }
    return timePassed;
  }
  pause(): void {
    if (this._pausedAtMs) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Stopwatch is already paused');
      }

      return;
    }
    this._pausedAtMs = Date.now();
  }
  resume(): void {
    if (!this._pausedAtMs) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Stopwatch is already unpaused');
      }

      return;
    }
    const nowMs = Date.now();
    this._countSinceMs += nowMs - this._pausedAtMs;
    this._pausedAtMs = null;
  }
}

/**
 * Automatically pauses when the element's playback is paused (kind of, see the functions it relies on), resumes when
 * it's not.
 */
class MediaElementPlaybackStopwatch {
  private readonly _stopwatch = new Stopwatch();
  public readonly destroy: () => void;
  constructor (el: HTMLMediaElement) {
    if (isPlaybackActive(el)) {
      this._stopwatch.resume();
    }
    // TODO how about also take desync correction (`settings.enableDesyncCorrection`) into account
    // (as it takes time to perform a seek)? How to detect it? When we've got a `currentTime` difference of less
    // than some amount of seconds.
    const removePlaybackStopListener = addPlaybackStopListener(el, () => this._stopwatch.pause());
    const removePlaybackResumeListener = addPlaybackResumeListener(el, () => this._stopwatch.resume());

    this.destroy = () => {
      removePlaybackStopListener();
      removePlaybackResumeListener();
    }
  }
  getTimeAndReset = () => this._stopwatch.getTimeAndReset();
  get time() {
    return this._stopwatch.time;
  }
}

type TimeSavedData = [
  timeSavedComparedToSoundedSpeed: number,
  timeSavedComparedToIntrinsicSpeed: number,
  wouldHaveLastedIfSpeedWasSounded: number,
  wouldHaveLastedIfSpeedWasIntrinsic: number,
];

function getSnippetTimeSavedInfo(
  snippetRealtimeDuration: number,
  speedDuring: number,
  soundedSpeedDuring: number
): TimeSavedData
{
  // TODO some of these variables are aslo calculated in `Controller._doOnSilence(End|Start)StretcherStuff`. DRY?

  // If we just use `speedDuring`, it would report time saved to be 0.2% when `soundedSpeed === 1` and
  // `volumeThreshold === 0`. Yes, this causes it to be not so accurate, but it's better than confusing the user.
  const untransformedSpeedDuring = speedDuring === transformSpeed(1)
    ? 1
    : speedDuring;
  const speedDuringComparedToSounded = untransformedSpeedDuring / soundedSpeedDuring;
  const speedDuringComparedToIntrinsic = untransformedSpeedDuring;
  const wouldHaveLastedIfSpeedWasSounded = speedDuringComparedToSounded * snippetRealtimeDuration;
  const wouldHaveLastedIfSpeedWasIntrinsic = speedDuringComparedToIntrinsic * snippetRealtimeDuration;
  // `wouldHaveLastedIfSpeedWasSounded - snippetRealtimeDuration` in a float-error-friendly form.
  const timeSavedComparedToSoundedSpeed = snippetRealtimeDuration * (speedDuringComparedToSounded - 1);
  // `wouldHaveLastedIfSpeedWasIntrinsic - snippetRealtimeDuration` in a float-error-friendly form.
  const timeSavedComparedToIntrinsicSpeed = snippetRealtimeDuration * (speedDuringComparedToIntrinsic - 1);

  if (process.env.NODE_ENV !== 'production') {
    if (timeSavedComparedToSoundedSpeed < 0) {
      console.warn("timeSavedComparedToSoundedSpeed < 0: ", timeSavedComparedToSoundedSpeed);
    }
  }

  return [
    timeSavedComparedToSoundedSpeed,
    timeSavedComparedToIntrinsicSpeed,
    wouldHaveLastedIfSpeedWasSounded,
    wouldHaveLastedIfSpeedWasIntrinsic,
  ];
}

/** Base e */
export function getDecayTimeConstant(latestDataIntegralWeight: number, latestDataPeriod: number): number {
  const latestDataWeightIsGreaterBy = latestDataIntegralWeight / (1 - latestDataIntegralWeight);
  return latestDataPeriod / Math.log(latestDataWeightIsGreaterBy + 1);
}

export default class TimeSavedTracker {
  private _currentElementSpeed: number;
  private _lastHandledSoundedSpeed: number;
  // These are true for the moment when the speed was last changed, they're not updated continuously.
  // See the `getTimeSavedData` method. TODO reflect this in their names?
  private _timeSavedComparedToSoundedSpeed = 0;
  private _timeSavedComparedToIntrinsicSpeed = 0;
  private _wouldHaveLastedIfSpeedWasSounded = 0;
  private _wouldHaveLastedIfSpeedWasIntrinsic = 0;
  private _playbackStopwatch: MediaElementPlaybackStopwatch;
  private _onDestroyCallbacks: Array<() => void> = [];

  // non-null assertion because it doesn't check if they're assigned inside functions called withing the constructor.
  // TODO?
  private _averagingMethod!: Settings['timeSavedAveragingMethod'];
  private _latestDataLength!: number;
  private _latestDataWeight!: number;
  private _decayTimeConstant!: number;
  constructor (
    private readonly element: HTMLMediaElement,
    settings: Settings,
    addOnSettingsChangedListener: (listener: (changes: MyStorageChanges) => void) => void,
    removeOnSettingsChangedListener: (listener: (changes: MyStorageChanges) => void) => void,
  ) {
    this._lastHandledSoundedSpeed = settings.soundedSpeed;
    this._setStateAccordingToNewSettings(settings);
    this._playbackStopwatch = new MediaElementPlaybackStopwatch(this.element);
    addOnSettingsChangedListener(this._onSettingsChange);
    element.addEventListener('ratechange', this._onElementSpeedChange);
    this._onDestroyCallbacks.push(() => {
      this._playbackStopwatch.destroy();
      removeOnSettingsChangedListener(this._onSettingsChange);
      element.removeEventListener('ratechange', this._onElementSpeedChange);
    });
    this._currentElementSpeed = element.playbackRate;
  }
  /**
   * @param variablesUpdatedAgo see the comment above `_timeSavedComparedToSoundedSpeed`
   */
  private _getTimeSavedData(
    variablesUpdatedAgo: number,
    speedDuringLastSnippet: number,
    soundedSpeedDuringLastSnippet: number
  ): TimeSavedData
  {
    const currSnippetDuration = variablesUpdatedAgo;
    const [
      currSnippetTimeSavedComparedToSoundedSpeed,
      currSnippetTimeSavedComparedToIntrinsicSpeed,
      currSnippetWouldHaveLastedIfSpeedWasSounded,
      currSnippetWouldHaveLastedIfSpeedWasIntrinsic,
    ] = getSnippetTimeSavedInfo(currSnippetDuration, speedDuringLastSnippet, soundedSpeedDuringLastSnippet);

    if (this._averagingMethod === 'exponential') { // TODO perf: perform this check only when it changes.
      const decayMultiplier = Math.E**(- variablesUpdatedAgo / this._decayTimeConstant);
      // TODO show the math behind this formula. And the ones above maybe.
      const currentSnippetIntegralDecayMultiplier = this._decayTimeConstant * (1 - decayMultiplier)
  
      const getNewDecayedTotal = (accumulatedValue: number, currentSnippetValue: number) =>
        accumulatedValue * decayMultiplier
        // What's that `|| 1`? It's because when `currSnippetDuration === 0`, `currentSnippetValue` is also 0, and the
        // whole also needs to be 0.
        + currentSnippetIntegralDecayMultiplier * currentSnippetValue / (currSnippetDuration || 1);
  
      return [
        getNewDecayedTotal(this._timeSavedComparedToSoundedSpeed, currSnippetTimeSavedComparedToSoundedSpeed),
        getNewDecayedTotal(this._timeSavedComparedToIntrinsicSpeed, currSnippetTimeSavedComparedToIntrinsicSpeed),
        getNewDecayedTotal(this._wouldHaveLastedIfSpeedWasSounded, currSnippetWouldHaveLastedIfSpeedWasSounded),
        getNewDecayedTotal(this._wouldHaveLastedIfSpeedWasIntrinsic, currSnippetWouldHaveLastedIfSpeedWasIntrinsic),
      ];
    } else {
      return [
        this._timeSavedComparedToSoundedSpeed + currSnippetTimeSavedComparedToSoundedSpeed,
        this._timeSavedComparedToIntrinsicSpeed + currSnippetTimeSavedComparedToIntrinsicSpeed,
        this._wouldHaveLastedIfSpeedWasSounded + currSnippetWouldHaveLastedIfSpeedWasSounded,
        this._wouldHaveLastedIfSpeedWasIntrinsic + currSnippetWouldHaveLastedIfSpeedWasIntrinsic,
      ];
    }
  }
  private _appendLastSnippetData(speedDuring: number, soundedSpeedDuring: number) {
    const snippetRealtimeDuration = this._playbackStopwatch.getTimeAndReset();
    const [
      timeSavedComparedToSoundedSpeed,
      timeSavedComparedToIntrinsicSpeed,
      wouldHaveLastedIfSpeedWasSounded,
      wouldHaveLastedIfSpeedWasIntrinsic,
    ] = this._getTimeSavedData(snippetRealtimeDuration, speedDuring, soundedSpeedDuring);
    this._timeSavedComparedToSoundedSpeed = timeSavedComparedToSoundedSpeed;
    this._timeSavedComparedToIntrinsicSpeed = timeSavedComparedToIntrinsicSpeed;
    this._wouldHaveLastedIfSpeedWasSounded = wouldHaveLastedIfSpeedWasSounded;
    this._wouldHaveLastedIfSpeedWasIntrinsic = wouldHaveLastedIfSpeedWasIntrinsic;
  }
  // TODO we must also take into consideration how long it took to seek (time between 'seeking' and 'seeked' events).
  // Then it will also be useful in `StretchingController` to calculate how much time has been lost due to desync
  // correction.
  // How about we just subtract ALL seeks' durations from time saved, and not just the ones' that were initiated by
  // a Controller for now? Though if the user seeks to an unbuffered area it's gonna take a long time...
  /** Useful when `silenceSpeed` is infinite, as opposed to `_onElementSpeedChange`. */
  public onControllerCausedSeek(seekDelta: Time): void {
    // Looks like this call can be skipped if `this._averagingMethod === 'all-time'`. TODO?
    this._appendLastSnippetData(this._currentElementSpeed, this._lastHandledSoundedSpeed);

    // Instead of the following, it would be more semantically correct to call `_appendLastSnippetData` a second
    // time, but it can't handle its `speedDuring` argument being `=== Infinity`.
    const seekDeltaIntrinsic = seekDelta;
    const seekDeltaSounded = seekDelta / this._currentElementSpeed;
    this._timeSavedComparedToSoundedSpeed += seekDeltaSounded;
    this._timeSavedComparedToIntrinsicSpeed += seekDeltaIntrinsic;
    this._wouldHaveLastedIfSpeedWasSounded += seekDeltaSounded;
    this._wouldHaveLastedIfSpeedWasIntrinsic += seekDeltaIntrinsic;
  }
  private _onElementSpeedChange = () => {
    const prevSpeed = this._currentElementSpeed;
    const currentElementSpeed = this.element.playbackRate;
    // In case it is `defaultPlaybackRate` that changed, not `playbackRate`. Or some other weird case.
    if (prevSpeed === currentElementSpeed) {
      return;
    }
    this._appendLastSnippetData(prevSpeed, this._lastHandledSoundedSpeed);
    this._currentElementSpeed = currentElementSpeed;
  }
  private _setStateAccordingToNewSettings(
    {
      timeSavedAveragingMethod,
      timeSavedAveragingWindowLength,
      timeSavedExponentialAveragingLatestDataWeight,
    }: Partial<Settings>
  ) {
    this._averagingMethod = timeSavedAveragingMethod ?? this._averagingMethod;
    if (timeSavedAveragingWindowLength !== undefined || timeSavedExponentialAveragingLatestDataWeight !== undefined) {
      this._latestDataLength = timeSavedAveragingWindowLength ?? this._latestDataLength;
      this._latestDataWeight = timeSavedExponentialAveragingLatestDataWeight ?? this._latestDataWeight;
      // How long in seconds it will take `decayMultiplier` to change by e.
      this._decayTimeConstant = getDecayTimeConstant(this._latestDataWeight, this._latestDataLength);
    }
  }
  private _onSettingsChange = (changes: MyStorageChanges) => {
    const soundedSpeedChange = changes.soundedSpeed;
    if (soundedSpeedChange) {
      this._onSoundedSpeedChange(soundedSpeedChange.newValue!);
    }

    const newValues = settingsChanges2NewValues(changes); // TODO perf: only assign relevant keys?
    this._setStateAccordingToNewSettings(newValues);
  }
  private _onSoundedSpeedChange(newSoundedSpeed: number) {
    const prevSoundedSpeed = this._lastHandledSoundedSpeed;
    // TODO if the element is currently at sounded speed, `_onElementSpeedChange` will also get called at the same
    // moment, which is not very efficient.
    this._appendLastSnippetData(this._currentElementSpeed, prevSoundedSpeed);
    this._lastHandledSoundedSpeed = newSoundedSpeed;
  }
  public get timeSavedData() {
    const currentSnippetDuration = this._playbackStopwatch.time;
    const [
      timeSavedComparedToSoundedSpeed,
      timeSavedComparedToIntrinsicSpeed,
      wouldHaveLastedIfSpeedWasSounded,
      wouldHaveLastedIfSpeedWasIntrinsic,
    ] = this._getTimeSavedData(currentSnippetDuration, this._currentElementSpeed, this._lastHandledSoundedSpeed);
    return {
      timeSavedComparedToSoundedSpeed,
      timeSavedComparedToIntrinsicSpeed,
      wouldHaveLastedIfSpeedWasSounded,
      wouldHaveLastedIfSpeedWasIntrinsic,
    };
  }
  public destroy(): void {
    for (const cb of this._onDestroyCallbacks) {
      cb();
    }
  }
}
