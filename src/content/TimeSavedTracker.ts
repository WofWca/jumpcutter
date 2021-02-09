import { MyStorageChanges } from "@/settings";
import { addPlaybackStopListener, addPlaybackResumeListener, isPlaybackActive } from './helpers';

/**
 * TODO this is very similar to how AudioContext's time works. Merge them?
 * TODO kind of looks to bloated for our purpose? Just put some development-only warnings on unintended usages instead
 * of handling every case (e.g. `lap` when it's paused)?
 */
class Stopwatch {
  private _totalCountSinceMs: number;
  private _lapCountSinceMs: number;
  private _pausedAtMs: number | null; // `null` when it's not paused.
  constructor() {
    const nowMs = Date.now();
    this._totalCountSinceMs = nowMs;
    this._lapCountSinceMs = nowMs;
    this._pausedAtMs = nowMs;
  }
  /**
   * @param time - must not be earlier than the last pause/unpause.
   */
  getTotalTimeAt(time: number) {
    return ((this._pausedAtMs ?? time) - this._totalCountSinceMs) / 1000;
  }
  getTotalTime(): number {
    return this.getTotalTimeAt(Date.now());
  }
  private _getLapTimeAt(nowMs: number) {
    return ((this._pausedAtMs ?? nowMs) - this._lapCountSinceMs) / 1000;
  }
  getLapTime(): number {
    return this._getLapTimeAt(Date.now());
  }
  lap(): number {
    const nowMs = Date.now();
    const timePassed = this._getLapTimeAt(nowMs);
    this._lapCountSinceMs = nowMs;
    if (this._pausedAtMs) {
      this._pausedAtMs = nowMs;
    }
    return timePassed;
  }
  // getTimeAndReset(): number {
  //   const nowMs = Date.now();
  //   const timePassed = this._getTime(nowMs);
  //   this._countSinceMs = nowMs;
  //   if (this._pausedAtMs) {
  //     this._pausedAtMs = nowMs;
  //   }
  //   return timePassed;
  // }
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
    const toAdd = nowMs - this._pausedAtMs
    this._totalCountSinceMs += toAdd;
    this._lapCountSinceMs += toAdd;
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
  // getTotalTimeAt = (time: number) => this._stopwatch.getTotalTimeAt(time);
  // getTotalTime = () => this._stopwatch.getTotalTime();
  // getLapTime = () => this._stopwatch.getLapTime();
  // lap = () => this._stopwatch.lap();
  getTotalTimeAt = this._stopwatch.getTotalTimeAt.bind(this._stopwatch);
  getTotalTime = this._stopwatch.getTotalTime.bind(this._stopwatch);
  getLapTime = this._stopwatch.getLapTime.bind(this._stopwatch);
  lap = this._stopwatch.lap.bind(this._stopwatch);
}

function getSnippetTimeSavedInfo(
  snippetRealtimeDuration: number,
  speedDuring: number,
  soundedSpeedDuring: number
): [
  timeSavedComparedToSoundedSpeed: number,
  timeSavedComparedToIntrinsicSpeed: number,
  wouldHaveLastedIfSpeedWasSounded: number,
  wouldHaveLastedIfSpeedWasIntrinsic: number,
]
{
  // TODO some of these variables are aslo calculated in `Controller._doOnSilence(End|Start)StretcherStuff`. DRY?
  const speedDuringComparedToSounded = speedDuring / soundedSpeedDuring;
  // TODO due to the fact that we have `transformSpeed` in `Controller.ts`, it says that time saved = 0.2% when
  // `volumeThreshold === 0 && soundedSpeed === 1`.
  const speedDuringComparedToIntrinsic = speedDuring;
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

export default class TimeSavedTracker {
  private _currentElementSpeed: number;
  // These are true for the moment when the speed was last changed, they're not updated continuously.
  // See the `getTimeSavedData` method. TODO reflect this in their names?
  private _timeSavedComparedToSoundedSpeed = 0;
  private _timeSavedComparedToIntrinsicSpeed = 0;
  private _wouldHaveLastedIfSpeedWasSounded = 0;
  private _wouldHaveLastedIfSpeedWasIntrinsic = 0;
  private _playbackStopwatch: MediaElementPlaybackStopwatch;
  private _playbackSnippets: Array<{ // TODO use tuples to save memory?
    start: number, // According to stopwatch time.
    end: number,
    speedDuring: number,
    soundedSpeedDuring: number,
  }> = [];
  private _onDestroyCallbacks: Array<() => void> = [];
  constructor (
    private readonly element: HTMLMediaElement,
    private currentSoundedSpeed: number,
    addOnSettingsChangedListener: (listener: (changes: MyStorageChanges) => void) => void,
    removeOnSettingsChangedListener: (listener: (changes: MyStorageChanges) => void) => void,
  ) {
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
  private _appendSnippetData(speedDuring: number, soundedSpeedDuring: number) {
    const snippetRealtimeDuration = this._playbackStopwatch.lap();
    const [
      timeSavedComparedToSoundedSpeed,
      timeSavedComparedToIntrinsicSpeed,
      wouldHaveLastedIfSpeedWasSounded,
      wouldHaveLastedIfSpeedWasIntrinsic,
    ] = getSnippetTimeSavedInfo(snippetRealtimeDuration, speedDuring, soundedSpeedDuring);
    this._timeSavedComparedToSoundedSpeed += timeSavedComparedToSoundedSpeed;
    this._timeSavedComparedToIntrinsicSpeed += timeSavedComparedToIntrinsicSpeed;
    this._wouldHaveLastedIfSpeedWasSounded += wouldHaveLastedIfSpeedWasSounded;
    this._wouldHaveLastedIfSpeedWasIntrinsic += wouldHaveLastedIfSpeedWasIntrinsic;
  }
  private _onElementSpeedChange = () => {
    const prevSpeed = this._currentElementSpeed;
    this._appendSnippetData(prevSpeed, this.currentSoundedSpeed);
    this._currentElementSpeed = this.element.playbackRate;
  }
  private _onSettingsChange = (changes: MyStorageChanges) => {
    const soundedSpeedChange = changes.soundedSpeed;
    if (soundedSpeedChange) {
      this._onSoundedSpeedChange(soundedSpeedChange.newValue!);
    }
  }
  private _onSoundedSpeedChange(newSoundedSpeed: number) {
    const prevSoundedSpeed = this.currentSoundedSpeed;
    // TODO if the element is currently at sounded speed, `_onElementSpeedChange` will also get called at the same
    // moment, which is not very efficient.
    this._appendSnippetData(this._currentElementSpeed, prevSoundedSpeed);
    this.currentSoundedSpeed = newSoundedSpeed;
  }
  public getTimeSavedData() {
    const currentSnippetDuration = this._playbackStopwatch.getLapTime();
    const [
      timeSavedComparedToSoundedSpeed,
      timeSavedComparedToIntrinsicSpeed,
      wouldHaveLastedIfSpeedWasSounded,
      wouldHaveLastedIfSpeedWasIntrinsic,
    ] = getSnippetTimeSavedInfo(currentSnippetDuration, this._currentElementSpeed, this.currentSoundedSpeed);
    return {
      timeSavedComparedToSoundedSpeed: this._timeSavedComparedToSoundedSpeed       + timeSavedComparedToSoundedSpeed,
      timeSavedComparedToIntrinsicSpeed: this._timeSavedComparedToIntrinsicSpeed   + timeSavedComparedToIntrinsicSpeed,
      wouldHaveLastedIfSpeedWasSounded: this._wouldHaveLastedIfSpeedWasSounded     + wouldHaveLastedIfSpeedWasSounded,
      wouldHaveLastedIfSpeedWasIntrinsic: this._wouldHaveLastedIfSpeedWasIntrinsic + wouldHaveLastedIfSpeedWasIntrinsic,
    };
  }
  public destroy(): void {
    for (const cb of this._onDestroyCallbacks) {
      cb();
    }
  }
}
