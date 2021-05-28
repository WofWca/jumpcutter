import browser from '@/webextensions-api';
import { assertDev, Time } from '@/helpers';
import { destroyAudioWorkletNode } from '@/content/helpers';
import once from 'lodash/once';
import throttle from 'lodash/throttle';
import SilenceDetectorNode, { SilenceDetectorEventType, SilenceDetectorMessage }
  from '@/content/SilenceDetector/SilenceDetectorNode';
import VolumeFilterNode from '@/content/VolumeFilter/VolumeFilterNode';

// A more semantically correct version would be `Array<[start: Time, end: Time]>`, but I think this is a bit faster.
// TODO `Float32Array` should be even faster, though it doesn't support `push`.
// But I think array is not the best suited data structure for this application in the first place.
type MyTimeRanges = {
  starts: Time[],
  ends: Time[],
}

/**
 * @returns If [[forTime]] is not within any of the [[ranges]], returns [[forTime]].
 */
function getNextOutOfRangesTime(ranges: MyTimeRanges, forTime: Time): Time {
  // TODO I wrote this real quick, no edge cases considered.
  const { starts, ends } = ranges;
  // TODO Super inefficient. Doesn't take into account the fact that it's sorted, and the fact that the previously
  // returned value and the next return value are related (becaus `currentTime` just grows (besides seeks)).
  // But before you optimize it, check out the comment near `seekCloneIfOriginalElIsPlayingUnprocessedRange`.
  const currentRangeInd = starts.findIndex((start, i) => {
    const end = ends[i];
    return start <= forTime && forTime <= end;
  });
  return currentRangeInd !== -1
    ? ends[currentRangeInd]
    : forTime;
}

function inRanges(ranges: TimeRanges, time: Time): boolean {
  // TODO super inefficient, same as with `getNextOutOfRangesTime`.
  for (let i = 0; i < ranges.length; i++) {
    const
      start = ranges.start(i),
      end = ranges.end(i);
    if (start <= time && time <= end) {
      return true;
    }
  }
  return false;
}

export default class Lookahead {
  clone: HTMLAudioElement; // Always <audio> for performance - so the browser doesn't have to decode video frames.
  lastSoundedTime: Time | undefined;

  // // onNewSilenceRange: TODO set in constructor?
  // silenceRanges: Array<[start: Time, end: Time]> = []; // Array is not the fastest data structure for this application.

  silenceRanges: {
    starts: Time[],
    ends: Time[],
  } = {
    starts: [],
    ends: [],
  };

  _onDestroyCallbacks: Array<() => void> = [];
  constructor(
    private originalElement: HTMLMediaElement,
    // public onNewSilenceRange: (start: Time, end: Time) => void,
  ) {
    const clone = document.createElement('audio');
    this.clone = clone;
    // TODO this probably doesn't cover all cases.
    clone.src = originalElement.currentSrc;
  }
  private async _init(): Promise<void> {
    const originalElement = this.originalElement;

    const playbackRate = 5; // TODO

    const clone = this.clone;

    const toAwait: Array<Promise<void>> = [];

    const ctx = new AudioContext({
      latencyHint: 'playback',
    });
    this._onDestroyCallbacks.push(() => ctx.close()); // Not sure if this is required, maybe it gets GCd automatically?
    ctx.suspend();
    const addWorkletProcessor = (url: string) => ctx.audioWorklet.addModule(browser.runtime.getURL(url));

    // TODO DRY
    // const smoothingWindowLenght = 0.03;
    // const smoothingWindowLenght = 0.1;
    const smoothingWindowLenght = 0.05;
    // TODO DRY the creation and destruction of these 2 nodes?
    const volumeFilterP = addWorkletProcessor('content/VolumeFilterProcessor.js').then(() => {
      const volumeFilter = new VolumeFilterNode(ctx, smoothingWindowLenght, smoothingWindowLenght);
      this._onDestroyCallbacks.push(() => destroyAudioWorkletNode(volumeFilter));
      return volumeFilter;
    });

    const silenceDetectorP = addWorkletProcessor('content/SilenceDetectorProcessor.js').then(() => {
      // TODO depend on settings and element speed, update as they change.
      // const marginAfterIntrinsicTime = 0.05;
      const marginAfterIntrinsicTime = 0.001;
      const marginAfterRealTime = marginAfterIntrinsicTime / playbackRate;

      const silenceDetector = new SilenceDetectorNode(ctx, marginAfterRealTime);
      this._onDestroyCallbacks.push(() => destroyAudioWorkletNode(silenceDetector));
      return silenceDetector;
    });

    const src = ctx.createMediaElementSource(clone);

    toAwait.push(volumeFilterP.then(async volumeFilter => {
      src.connect(volumeFilter);
      const silenceDetector = await silenceDetectorP;
      volumeFilter.connect(silenceDetector);
    }));
    toAwait.push(silenceDetectorP.then(silenceDetector => {
      silenceDetector.volumeThreshold = 0.015; // TODO

      silenceDetector.port.onmessage = msg => {
        const data = msg.data as SilenceDetectorMessage;
        // TODO for better precision the SilenceDetectorProcessor needs to send the time (`context.currentTime`)
        // when it was detected.
        if (data === SilenceDetectorEventType.SILENCE_START) {
          this.lastSoundedTime = this.clone.currentTime;
        } else {
          assertDev(this.lastSoundedTime, 'Thought `this.lastSoundedTime` to be set because SilenceDetector was '
            + 'thought to always send `SilenceDetectorEventType.SILENCE_START` before `SILENCE_END`');

          const negativeMarginAfterLol = smoothingWindowLenght;

          // const marginBeforeIntrinsicTime = 0.05; // TODO
          const marginBeforeIntrinsicTime = smoothingWindowLenght + 0.1; // TODO
          const marginBeforeRealTime = marginBeforeIntrinsicTime / playbackRate;
          // TODO `this.lastSoundedTime` can be bigger than `this.clone.currentTime - marginBeforeRealTime`.
          // this.pushNewSilenceRange(this.lastSoundedTime, this.clone.currentTime - marginBeforeRealTime);
          this.pushNewSilenceRange(this.lastSoundedTime - negativeMarginAfterLol, this.clone.currentTime - marginBeforeRealTime);
        }
      }
    }));

    clone.playbackRate = playbackRate;
    // For better performance. TODO however I'm not sure if this can significantly affect volume readings.
    // On one hand we could say "we don't change the waveform, we're just processing it faster", on the other hand
    // frequency characteristics are changed, and there's a risk of exceeding the Nyquist frequency.
    (clone as any).preservesPitch = false;

    // It's a bit weird that it's not at the very bottom of the function. TODO?
    await Promise.all(toAwait);

    // TODO but this can make `silenceRanges` [non-normalized](https://html.spec.whatwg.org/multipage/media.html#normalised-timeranges-object),
    // i.e. non-sorted and having overlapping (in our case, duplicate) entries.
    // However, the current implementation of `getNextSoundedTime` (and `getNextOutOfRangesTime`) allows this.
    const seekCloneIfOriginalElIsPlayingUnprocessedRange = () => {
      const originalElementTime = originalElement.currentTime;
      const playingUnprocessedRange = !inRanges(clone.played, originalElementTime);
      if (playingUnprocessedRange) {
        // TODO call `pushNewSilenceRange` before seeking if it's silence currently?
        clone.currentTime = originalElementTime; // TODO `fastSeek`, because we don't need precision here.
        // To avoid the case where it's currently silence, then you seek forward a lot and it's loud so it marks
        // the whole range that you skipped as silence.
        // TODO it seems to me that it would be cleaner to somehow reset the state of `silenceDetector` instead so
        // if there is silence where we seek, it will emit `SILENCE_START` even if the last thing
        // it emited too was `SILENCE_START`.
        this.lastSoundedTime = originalElementTime;
      }
    }
    // TODO also utilize `requestIdleCallback` so it gets called less frequently during high loads?
    const throttledSeekCloneIfPlayingUnprocessedRange = throttle(seekCloneIfOriginalElIsPlayingUnprocessedRange, 1000);
    // TODO using `timeupdate` is pretty bug-proof, but not very efficient.
    originalElement.addEventListener('timeupdate', throttledSeekCloneIfPlayingUnprocessedRange);
    this._onDestroyCallbacks.push(() => {
      originalElement.removeEventListener('timeupdate', throttledSeekCloneIfPlayingUnprocessedRange);
    });

    // So silenceDetector doesn't process audio from the clone element while it is paused
    // (e.g. if it reached the end, or fetching data).
    // TODO need to also pause processing between 'seeking' and 'seeked'.
    // TODO The same problem exists in the StretchingController. DRY?
    const resumeAudioContext = () => {
      ctx.resume();
    };
    const suspendAudioContext = () => {
      ctx.suspend();
    }
    if (!clone.paused) {
      resumeAudioContext();
    }
    clone.addEventListener('pause', suspendAudioContext);
    clone.addEventListener('play', resumeAudioContext);
    this._onDestroyCallbacks.push(() => {
      clone.removeEventListener('pause', suspendAudioContext);
      clone.removeEventListener('play', resumeAudioContext);
    });

    // For performance
    const playClone = () => {
      // TODO but if the clone has been fully played and is paused now, this will start it again.
      // Should be fixed by checking `clone.played` on `clone.ontimeupdate`.
      clone.play();
    };
    const pauseClone = () => {
      clone.pause();
    }
    if (!originalElement.paused) {
      playClone();
    }
    originalElement.addEventListener('pause', pauseClone);
    originalElement.addEventListener('play', playClone);
    this._onDestroyCallbacks.push(() => {
      originalElement.removeEventListener('pause', pauseClone);
      originalElement.removeEventListener('play', playClone);
    });
  }
  public ensureInit = once(this._init);

  public getNextSoundedTime(forTime: Time): Time {
    return getNextOutOfRangesTime(this.silenceRanges, forTime);
  }
  private pushNewSilenceRange(elementTimeStart: Time, elementTimeEnd: Time) {
    this.silenceRanges.starts.push(elementTimeStart);
    this.silenceRanges.ends.push(elementTimeEnd);
  }
  public async destroy(): Promise<void> {
    await this.ensureInit();
    for (const cb of this._onDestroyCallbacks) {
      cb();
    }
  }
}
