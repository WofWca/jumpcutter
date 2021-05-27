import browser from '@/webextensions-api';
import { assertDev, Time } from '@/helpers';
import once from 'lodash/once';
// import { audioContext, mediaElementSourcesMap } from '../audioContext';
// import sortedIndex from 'lodash/sortedIndex';

import SilenceDetectorNode, { SilenceDetectorEventType, SilenceDetectorMessage }
  from "../SilenceDetector/SilenceDetectorNode";
import VolumeFilterNode from "../VolumeFilter/VolumeFilterNode";

// TODO DRY
function destroyAudioWorkletNode(node: AudioWorkletNode) {
  node.port.postMessage('destroy');
  node.port.close();
}

// A more semantically correct version would be `Array<[start: Time, end: Time]>`, but I think this is a bit faster.
// TODO `Float32Array` should be even faster, though it doesn't support `push`.
// But I think array is not the best suted data structure for this application in the first place.
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
  const currentRangeInd = starts.findIndex((start, i) => {
    const end = ends[i];
    return start <= forTime && forTime <= end;
  });
  return currentRangeInd !== -1
    ? ends[currentRangeInd]
    : forTime;
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

  initialized = false;
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

    if (this.initialized) { // TODO Wrong. Won't return if it being initialized. `lodash.once`?
      return;
    }

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
    (clone as any).preservesPitch = false; // TODO

    // It's a bit weird that it's not at the very bottom of the function. TODO?
    await Promise.all(toAwait);

    // Temporary measure in case the user wanted to enable this controller halfway through the media.
    // TODO support seeking. Utilize `el.played` TimeRanges?
    clone.currentTime = originalElement.currentTime;

    // For performance.
    // TODO need to suspend AudioContext when the clone stops playing, and not just the original element
    // (e.g. it reached the end, or fetching data), so listeners must also be attached to the clone element.
    // Also AudioContext needs to be suspended between 'seeking' and 'seeked' so silenceDetector doesn't consider that
    // time. Same problem exists in the StretchingController.
    const onPlay = () => {
      clone.play();
      ctx.resume();
    };
    const onPause = () => {
      clone.pause();
      ctx.suspend();
    }
    if (!originalElement.paused) {
      onPlay();
    }
    originalElement.addEventListener('pause', onPause);
    originalElement.addEventListener('play', onPlay);
    this._onDestroyCallbacks.push(() => {
      originalElement.removeEventListener('pause', onPause);
      originalElement.removeEventListener('play', onPlay);
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
