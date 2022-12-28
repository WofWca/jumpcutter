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

import browser from '@/webextensions-api';
import { Settings as ExtensionSettings } from '@/settings';
import { assertDev, clamp, maxPlaybackRate, MediaTime } from '@/helpers';
import { destroyAudioWorkletNode, getRealtimeMargin } from '@/entry-points/content/helpers';
import once from 'lodash/once';
import throttle from 'lodash/throttle';
import SilenceDetectorNode, { SilenceDetectorEventType, SilenceDetectorMessage }
  from '@/entry-points/content/SilenceDetector/SilenceDetectorNode';
import VolumeFilterNode from '@/entry-points/content/VolumeFilter/VolumeFilterNode';
import lookaheadVolumeFilterSmoothing from './lookaheadVolumeFilterSmoothing.json'

// A more semantically correct version would be `Array<[start: MediaTime, end: MediaTime]>`,
// but I think this is a bit faster.
// TODO `Float32Array` should be even faster, though it doesn't support `push`.
// But I think array is not the best suited data structure for this application in the first place.
type MyTimeRanges = {
  starts: MediaTime[],
  ends: MediaTime[],
}
export type TimeRange = [start: MediaTime, end: MediaTime];

function inRanges(ranges: TimeRanges, time: MediaTime): boolean {
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

type LookaheadSettings = Pick<ExtensionSettings, 'volumeThreshold' | 'marginBefore' | 'marginAfter'>;

// The `maxPlaybackRate` could change in the future, to something like 64, so let's cap it at
// this value. Because higher playback rate is more processing-heavy (things may start lagging)
// and reduces time accuracy of silence ranges, which can cause it to miss short silence ranges.
// This is practically the greatest effective absolute playbackRate one expects to achieve.
// TODO improvement: turn this into an option.
const maxClonePlaybackRate = Math.min(8, maxPlaybackRate);

export default class Lookahead {
  clone: HTMLAudioElement; // Always <audio> for performance - so the browser doesn't have to decode video frames.
  silenceSince: MediaTime | undefined;

  // // onNewSilenceRange: TODO set in constructor?
  // silenceRanges: Array<[start: Time, end: Time]> = []; // Array is not the fastest data structure for this application.

  silenceRanges: MyTimeRanges = {
    starts: [],
    ends: [],
  };

  private _resolveDestroyedPromise!: () => void;
  private _destroyedPromise = new Promise<void>(r => this._resolveDestroyedPromise = r);
  constructor(
    private originalElement: HTMLMediaElement,
    private settings: LookaheadSettings,
    // public onNewSilenceRange: (start: Time, end: Time) => void,
  ) {
    const clone = document.createElement('audio');
    this.clone = clone;

    // TODO this probably doesn't cover all cases. Maybe it's better to just `originalElement.cloneNode(true)`?
    // TODO also need to watch for changes of `crossOrigin`
    // (in `ElementPlaybackControllerCloning.ts`).
    clone.crossOrigin = originalElement.crossOrigin;
    clone.src = originalElement.currentSrc;

    // Not doing this appears to cause a resource (memory and processing) leak in Chromium manifesting itself when
    // creating new instances of Lookahead (and discarding the old ones).
    // Seems like a browser bug. TODO?
    // BTW, `clone.pause()` also works.
    this._destroyedPromise.then(() => clone.src = '');

    if (IS_DEV_MODE) {
      const interval = setInterval(() => {
        const cloneSrc = clone.src;
        const originalSrc = originalElement.currentSrc;
        if (cloneSrc !== originalSrc) {
          console.error('clone.src !== originalElement.currentSrc,', '\n', cloneSrc, '\n', originalSrc);
        }
      }, 2000);
      this._destroyedPromise.then(() => clearInterval(interval));
    }
  }
  private async _init(): Promise<void> {
    const originalElement = this.originalElement;

    const clone = this.clone;

    const toAwait: Array<Promise<void>> = [];

    const ctx = new AudioContext({
      latencyHint: 'playback',
    });
    this._destroyedPromise.then(() => ctx.close()); // Not sure if this is required, maybe it gets GCd automatically?
    ctx.suspend();
    const addWorkletProcessor = (url: string) => ctx.audioWorklet.addModule(browser.runtime.getURL(url));

    // TODO DRY
    // const smoothingWindowLenght = 0.03;
    // const smoothingWindowLenght = 0.15;
    // TODO improvement: `lookaheadVolumeFilterSmoothing` must depend on the element's playbackRate.
    const smoothingWindowLenght = lookaheadVolumeFilterSmoothing;
    // TODO DRY the creation and destruction of these 2 nodes?
    const volumeFilterP = addWorkletProcessor('content/VolumeFilterProcessor.js').then(() => {
      const volumeFilter = new VolumeFilterNode(ctx, smoothingWindowLenght, smoothingWindowLenght);
      this._destroyedPromise.then(() => destroyAudioWorkletNode(volumeFilter));
      return volumeFilter;
    });

    const silenceDetectorDurationThreshold = this._getSilenceDetectorNodeDurationThreshold();
    const silenceDetectorP = addWorkletProcessor('content/SilenceDetectorProcessor.js').then(() => {
      const silenceDetector = new SilenceDetectorNode(ctx, silenceDetectorDurationThreshold);
      this._destroyedPromise.then(() => destroyAudioWorkletNode(silenceDetector));
      return silenceDetector;
    });

    const src = ctx.createMediaElementSource(clone);

    // When `smoothingWindowLenght` is pretty big, it needs to be taken into account.
    // It kinda acts as a delay, so `marginBefore` gets decreased and `marginAfter` gets increased.
    // The following is to compensate for this.
    // TODO Though the delay value is up for debate. Some might say it should be half equal to
    // `smoothingWindowLenght`, or smaller than a half.
    const volumeSmoothingCausedDelay = smoothingWindowLenght / 2;

    toAwait.push(volumeFilterP.then(async volumeFilter => {
      src.connect(volumeFilter);
      const silenceDetector = await silenceDetectorP;
      volumeFilter.connect(silenceDetector);
    }));
    toAwait.push(silenceDetectorP.then(silenceDetector => {
      silenceDetector.volumeThreshold = this.settings.volumeThreshold;

      silenceDetector.port.onmessage = msg => {
        const [eventType, eventTimeAudioContextTime] = msg.data as SilenceDetectorMessage;
        const realTimePassedSinceEvent = ctx.currentTime - eventTimeAudioContextTime;
        if (eventType === SilenceDetectorEventType.SILENCE_START) {
          // `marginAfter` will be taken into account when we `pushNewSilenceRange`.
          const realTimePassedSinceSilenceStart =
            realTimePassedSinceEvent + silenceDetector.durationThreshold + volumeSmoothingCausedDelay;
          const intrinsicTimePassedSinceSilenceStart = realTimePassedSinceSilenceStart * this.clone.playbackRate;
          const silenceStartAtIntrinsicTime = this.clone.currentTime - intrinsicTimePassedSinceSilenceStart;
          this.silenceSince = silenceStartAtIntrinsicTime;
        } else {
          assertDev(this.silenceSince, 'Thought `this.silenceSince` to be set because SilenceDetector was '
            + 'thought to always send `SilenceDetectorEventType.SILENCE_START` before `SILENCE_END`');
          const realTimePassedSinceSilenceEnd =
            realTimePassedSinceEvent + volumeSmoothingCausedDelay;
          const intrinsicTimePassedSinceSilenceEnd = realTimePassedSinceSilenceEnd * this.clone.playbackRate;
          const silenceEndAtIntrinsicTime = this.clone.currentTime - intrinsicTimePassedSinceSilenceEnd;
          this.pushNewSilenceRange(
            this.silenceSince + this.settings.marginAfter,
            silenceEndAtIntrinsicTime - this.settings.marginBefore,
          );

          this.silenceSince = undefined;
        }
      }
    }));

    // If it's currently silent and we've reached the end of the video, `silenceDetector` won't emit
    // `SilenceDetectorEventType.SILENCE_END` (and righly so), so `pushNewSilenceRange` wouldn't be performed.
    // Need to handle this case separately.
    // You could ask - but is it useful at all to just seek to the end of the video, even though there is silence.
    // The answer - yes, e.g. if the user is watching a playlist, where e.g. in each video there is a silent outro.
    const onEnded = () => {
      const currentlySounded = !this.silenceSince;
      if (currentlySounded) {
        return;
      }
      // In case it's due to a seek to the end of the file, so we don't create a silence range of 0 length.
      if (this.silenceSince === this.clone.duration) {
        return;
      }
      assertDev(this.silenceSince);
      this.pushNewSilenceRange(
        this.silenceSince + this.settings.marginAfter,
        this.clone.duration,
      );
    }
    clone.addEventListener('ended', onEnded, { passive: true });
    this._destroyedPromise.then(() => clone.removeEventListener('ended', onEnded));

    // For better performance. TODO however I'm not sure if this can significantly affect volume readings.
    // On one hand we could say "we don't change the waveform, we're just processing it faster", on the other hand
    // frequency characteristics are changed, and there's a risk of exceeding the Nyquist frequency.
    (clone as any).preservesPitch = false;

    // It's a bit weird that it's not at the very bottom of the function. TODO?
    await Promise.all(toAwait);

    // TODO perf: also need to seek if the clone started playing a processed range.
    // TODO but this can make `silenceRanges` [non-normalized](https://html.spec.whatwg.org/multipage/media.html#normalised-timeranges-object),
    // i.e. non-sorted and having overlapping (in our case, duplicate) entries.
    // However, the current implementation of `getMaybeSilenceRangeForTime` allows this.
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
        this.silenceSince = originalElementTime;
      }
    }
    // TODO perf: also utilize `requestIdleCallback` so it gets called less frequently during high loads?
    // TODO perf: we could instead detach the listener and attach it again after one second.
    // TODO fix: if seeking the clone takes more than 1 second, then it will stuck in the
    // `clone.seeking === true` state.
    const throttledSeekCloneIfPlayingUnprocessedRange = throttle(seekCloneIfOriginalElIsPlayingUnprocessedRange, 1000);
    // TODO using `timeupdate` is pretty bug-proof, but not very efficient.
    originalElement.addEventListener('timeupdate', throttledSeekCloneIfPlayingUnprocessedRange, { passive: true });
    this._destroyedPromise.then(() => {
      originalElement.removeEventListener('timeupdate', throttledSeekCloneIfPlayingUnprocessedRange);
    });

    {
      // TODO refactor: shouldn't we watch both originalElement's and clone's 'timeupdate'?
      // Are there edge cases?
      const addListener = () => originalElement.addEventListener(
        'timeupdate',
        setClonePlaybackRateAndScheduleAnother,
        { once: true, passive: true }
      );
      let timeoutId = -1;
      const setClonePlaybackRateAndScheduleAnother = () => {
        // TODO improvement: also make it depend on `soundedSpeed` and how much
        // silence there is and other stuff. Maybe also on for how long we can't keep up?
        // Maybe we could utilize `TimeSavedTracker`.
        // Because it doesn't make sense to play the clone say 4x faster than
        // the original if we're only expecting 10% of the meida to be silent.
        // Like if there was a seek forward maybe we don't want to immediately switch to max speed?
        // Also does it really make sense to set the max speed right from the start?

        // TODO improvement: this doesn't consider how much silence there is. So if the clone is ahead
        // 1 minute, but all that minute is silence, we'll slow down, but we shouldn't.
        const aheadSeconds = clone.currentTime - originalElement.currentTime;
        if (IS_DEV_MODE) {
          // TODO improvement: this can happen when a seek is performed. In that case speed will jump to max.
          if (aheadSeconds < 0) {
            console.warn('aheadSeconds < 0:', aheadSeconds, clone.currentTime, originalElement.currentTime);
          }
        }
        // Speed is max when 0 seconds ahead and is 0 when 3 minutes ahead (but we'll clamp it, below).
        const playbackRateUnclamped = maxClonePlaybackRate * (1 - (aheadSeconds / (3 * 60)));
        // Min clamp shouldn't be low because of performance - playing a video at 0.01 speed for 100 seconds
        // is much worse than playing it at 1 speed for 1 second.
        // TODO perf: Need to pause the video instead when it goes below the lower bound.
        // Need upper bound just in case `aheadSeconds` is negative for some reason.
        // TODO improvement: also approaching it this way in effect makes it so that the greater
        // the effective playbackRate of the original element is, the less far ahead the clone
        // is going to be, which sounds a little stupid.
        clone.playbackRate = clamp(playbackRateUnclamped, 2, maxClonePlaybackRate);
        // TODO refactor: await for it somewhere above, otherwise it's not synchronous.
        // Also it's not really correct to immediately change `durationThreshold` because
        // the `silenceDetector` has data of media being played at different speed.
        silenceDetectorP.then(silenceDetector => {
          silenceDetector.durationThreshold = this._getSilenceDetectorNodeDurationThreshold();
        });
        // TODO perf: changing playback rate too often may not be a good idea.
        // Maybe need to change the speed in steps (like don't change by less than 0.5).
        timeoutId = (setTimeout as typeof window.setTimeout)(
          addListener,
          3000
        );
      };
      setClonePlaybackRateAndScheduleAnother();
      this._destroyedPromise.then(() => {
        originalElement.removeEventListener('timeupdate', setClonePlaybackRateAndScheduleAnother);
        clearTimeout(timeoutId);
      });
    }

    // So silenceDetector doesn't process audio from the clone element while it is paused
    // (e.g. if it reached the end, or fetching data).
    // TODO need to also pause processing between 'seeking' and 'seeked'.
    // TODO The same problem exists in the ElementPlaybackControllerStretching. DRY?
    const resumeAudioContext = () => {
      ctx.resume();
    };
    const suspendAudioContext = () => {
      ctx.suspend();
    }
    if (!clone.paused) {
      resumeAudioContext();
    }
    clone.addEventListener('pause', suspendAudioContext, { passive: true });
    clone.addEventListener('play', resumeAudioContext, { passive: true });
    this._destroyedPromise.then(() => {
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
    originalElement.addEventListener('pause', pauseClone, { passive: true });
    originalElement.addEventListener('play', playClone, { passive: true });
    this._destroyedPromise.then(() => {
      originalElement.removeEventListener('pause', pauseClone);
      originalElement.removeEventListener('play', playClone);
    });
  }
  public ensureInit = once(this._init);

  private _getSilenceDetectorNodeDurationThreshold() {
    return getRealtimeMargin(this.settings.marginAfter + this.settings.marginBefore, this.clone.playbackRate);
  }

  /**
   * Can be called before `ensureInit` has finished.
   * @returns If the `time` argument falls into a silence range, that range is returned.
   *    `undefined` if there's no next silence range.
   */
  public getNextSilenceRange(time: MediaTime): TimeRange | undefined {
    // TODO I wrote this real quick, no edge cases considered.
    // TODO Super inefficient. Doesn't take into account the fact that it's sorted, and the fact that the previously
    // returned value and the next return value are related (becaus `currentTime` just grows (besides seeks)).
    // But before you optimize it, check out the comment near `seekCloneIfOriginalElIsPlayingUnprocessedRange`.
    const { starts, ends } = this.silenceRanges;
    const numRanges = ends.length;
    let closestFutureEnd = Infinity;
    let closestFutureEndI;
    for (let i = 0; i < numRanges; i++) {
      const currEnd = ends[i];
      if (currEnd > time && currEnd < closestFutureEnd) {
        closestFutureEnd = currEnd;
        closestFutureEndI = i;
      }
    }
    if (closestFutureEndI === undefined) {
      // `time` is past all the ranges.
      return undefined;
    }
    const nextSilenceRange: TimeRange = [starts[closestFutureEndI], ends[closestFutureEndI]];
    return nextSilenceRange;
  }
  // /**
  //  * @returns `TimeRange` if `forTime` falls into one, `undefined` otherwise.
  //  * Can be called before `ensureInit` has finished.
  //  */
  // public getMaybeSilenceRangeForTime(time: MediaTime): TimeRange | undefined {
  //   // TODO I wrote this real quick, no edge cases considered.
  //   // TODO Super inefficient. Doesn't take into account the fact that it's sorted, and the fact that the previously
  //   // returned value and the next return value are related (becaus `currentTime` just grows (besides seeks)).
  //   // But before you optimize it, check out the comment near `seekCloneIfOriginalElIsPlayingUnprocessedRange`.
  //   const { starts, ends } = this.silenceRanges;
  //   const currentRangeInd = starts.findIndex((start, i) => {
  //     const end = ends[i];
  //     return start <= time && time <= end;
  //   });
  //   return currentRangeInd !== -1
  //     ? [starts[currentRangeInd], ends[currentRangeInd]]
  //     : undefined;
  // }
  private pushNewSilenceRange(elementTimeStart: MediaTime, elementTimeEnd: MediaTime) {
    const silenceDuration = elementTimeEnd - elementTimeStart;
    // Not really necessary, but reduces the size of silenceRanges arrays a bit.
    // The final decision on whether or not to perform a seek is made in
    // `ElementPlaybackControllerCloning`, see `farEnoughToPerformSeek`.
    // `expectedSeekDuration` is ulikely to get lower than this value.
    // But even if it were to get lower, if we don't encounter silence ranges of such duration too often,
    // we don't loose too much time not skipping them anyway.
    if (silenceDuration < 0.010) {
      if (IS_DEV_MODE) {
        if (silenceDuration <= 0) {
          if (silenceDuration < -0.050) {
            console.error('Huge negative silence duration', silenceDuration);
          } else {
            console.warn('Negative silence duration', silenceDuration);
          }
        }
      }

      return;
    }
    this.silenceRanges.starts.push(elementTimeStart);
    this.silenceRanges.ends.push(elementTimeEnd);
  }
  public async destroy(): Promise<void> {
    await this.ensureInit();

    this._resolveDestroyedPromise();
  }
}
