/**
 * @license
 * Copyright (C) 2021, 2022, 2023, 2025  WofWca <wofwca@protonmail.com>
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

import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';
import { Settings as ExtensionSettings } from '@/settings';
import { assertDev, clamp, maxPlaybackRate, MediaTime } from '@/helpers';
import { destroyAudioWorkletNode, getRealtimeMargin } from '@/entry-points/content/helpers';
import once from 'lodash/once';
import throttle from 'lodash/throttle';
import SilenceDetectorNode, { SilenceDetectorEventType, SilenceDetectorMessage }
  from '@/entry-points/content/SilenceDetector/SilenceDetectorNode';
import VolumeFilterNode from '@/entry-points/content/VolumeFilter/VolumeFilterNode';
import lookaheadVolumeFilterSmoothing from './lookaheadVolumeFilterSmoothing.json'
import {
  getOrCreateMediaElementSourceAndUpdateMap
} from '@/entry-points/content/getOrCreateMediaElementSourceAndUpdateMap';
import { getFinalCloneElement } from './getFinalCloneElement';

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
const maxClonePlaybackRateDefault = Math.min(8, maxPlaybackRate);
const maxClonePlaybackRateWhenMediaSourceSrc = Math.min(4, maxPlaybackRate);

export default class Lookahead {
  // Always <audio> for performance - so the browser doesn't have to decode video frames.
  clone: HTMLAudioElement | undefined;
  /**
   * This is `MediaTime` if the clone is currently playing a silent part,
   * otherwise `undefined`.
   * The time is when the loudness from `VolumeFilter` crossed
   * the volume threshold, no margin before or margin after involved.
   */
  silenceSince: MediaTime | undefined;

  // // onNewSilenceRange: TODO set in constructor?
  // silenceRanges: Array<[start: Time, end: Time]> = []; // Array is not the fastest data structure for this application.

  silenceRanges: MyTimeRanges = {
    starts: [],
    ends: [],
  };

  private _resolveDestroyedPromise!: () => void;
  private _destroyedPromise = new Promise<void>(r => this._resolveDestroyedPromise = r);
  /**
   * @param getFallbackCloneElement a function that returns a clone element. It is used when
   * the `Lookahead` could not reuse the same source as the original element. The current
   * use case is when the original element uses `MediaSource`. The function may return the same
   * clone element for different calls.
   */
  constructor(
    private originalElement: HTMLMediaElement,
    private settings: LookaheadSettings,
    // public onNewSilenceRange: (start: Time, end: Time) => void,
    private readonly getFallbackCloneElement:
      undefined | ((originalElement: HTMLMediaElement) => Promise<HTMLAudioElement | undefined>),
    private onClonePlaybackError: () => void,
  ) {}
  private async _init(): Promise<void> {
    const originalElement = this.originalElement;
    const cloneElementP = getFinalCloneElement(
      originalElement,
      this.getFallbackCloneElement,
    );

    // TODO perf: don't await here, schedule other async operations.
    const [clone, isFallbackElement] = await cloneElementP;
    /**
     * Whether the same element can be used between `Lookahead` instantiations and stuff.
     * Otherwise it's disposable and we don't care what happens to it once we stop needing it.
     */
    const isCloneElementAndAudioContextReusable = isFallbackElement;
    this.clone = clone;

    if (clone.error) {
      this.onClonePlaybackError();
    }
    clone.addEventListener("error", this.onClonePlaybackError, { passive: true });
    this._destroyedPromise.then(() =>
      clone.removeEventListener("error", this.onClonePlaybackError)
    );

    if (isCloneElementAndAudioContextReusable) {
      this._destroyedPromise.then(() => {
        clone.pause();
        // A lot of state is not reset, e.g. `playbackRate`, `volume`, `preservesPitch`,
        // `currentTime`, because the next instance of `Lookahead` is gonna update it to
        // whatever it needs anyway.
      });
    } else {
      // Not doing this appears to cause a resource (memory and processing) leak in Chromium
      // manifesting itself when creating new instances of Lookahead (and discarding the old ones).
      // Looks like it's because
      // https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource
      // > only once a media element is in a state where no further audio could ever be
      // > played by that element may the element be garbage collected
      // Here's the advice that tells us to do exactly this:
      // https://html.spec.whatwg.org/multipage/media.html#best-practices-for-authors-using-media-elements
      // > or, even better, by setting the element's src attribute to an empty string
      // BTW, `clone.pause()` also works (sometimes?)
      this._destroyedPromise.then(() => clone.src = '');
    }

    if (IS_DEV_MODE && !isFallbackElement) {
      const interval = setInterval(() => {
        const cloneSrc = clone.src;
        const originalSrc = originalElement.currentSrc;
        if (cloneSrc !== originalSrc) {
          console.error('clone.src !== originalElement.currentSrc,', '\n', cloneSrc, '\n', originalSrc);
        }
      }, 2000);
      this._destroyedPromise.then(() => clearInterval(interval));
    }

    const toAwait: Array<Promise<void>> = [];

    // TODO make sure to properly clean up the element, i.e. remove event listeners and stuff.
    // Not only the element, but the audioContext as well.

    // I might have made it too obscure, but yeah, if
    // `isCloneElementAndAudioContextReusable === false` then we create an `AudioContext` here
    // unconditionally.
    const [ctx, src] = getOrCreateMediaElementSourceAndUpdateMap(
      clone,
      () => new AudioContext({
        latencyHint: 'playback',
      }),
    );
    if (isCloneElementAndAudioContextReusable) {
      // The fact that the clone element is reusable also means that the `AudioContext` that it's
      // attached to must be reusable as well because `createMediaelementSource` can only be called
      // once for an element.
      // Maybe we should use `clone.captureStream()` instead (when it's properly supported by
      // browsers)?
      this._destroyedPromise.then(() => ctx.suspend());
    } else {
      // Not sure if this is required, maybe it gets GCd automatically?
      this._destroyedPromise.then(() => ctx.close());
    }
    ctx.suspend();
    const addWorkletProcessor = (url: string) =>
      ctx.audioWorklet.addModule(browserOrChrome.runtime.getURL(url));

    // TODO refactor: DRY
    // const smoothingWindowLenght = 0.03;
    // const smoothingWindowLenght = 0.15;
    // TODO improvement: `lookaheadVolumeFilterSmoothing` must depend on the element's playbackRate.
    const smoothingWindowLenght = lookaheadVolumeFilterSmoothing;
    // TODO refactor: DRY the creation and destruction of these 2 nodes?
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

    // When `smoothingWindowLenght` is pretty big, it needs to be taken into account.
    // It kinda acts as a delay, so `marginBefore` gets decreased and `marginAfter` gets increased.
    // The following is to compensate for this.
    // TODO refactor: Though the delay value is up for debate. Some might say it should be half
    // equal to `smoothingWindowLenght`, or smaller than a half.
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
          const intrinsicTimePassedSinceSilenceStart = realTimePassedSinceSilenceStart * clone.playbackRate;
          // TODO fix: very rarely this calculation can be a little off. It can happen when
          // 1. The element got paused juuust before the event, and then got unpaused again.
          // Imagine if the time between the message is sent and is received is 1 second.
          // This code would say "well", the event actually happened one second ago, and the
          // `playbackRate` of the element is 4, therefore it happend 4 intrinsic seconds ago.
          // 2. Playback rate of the clone element got changed just recently.
          // The bigger `silenceDetector.durationThreshold` is, the bigger is the error.
          // Same applies to the `SILENCE_END` case below.
          const silenceStartAtIntrinsicTime = clone.currentTime - intrinsicTimePassedSinceSilenceStart;
          this.silenceSince = silenceStartAtIntrinsicTime;
        } else {
          assertDev(this.silenceSince != undefined,
            'Thought `this.silenceSince` to be set because SilenceDetector was '
            + 'thought to always send `SilenceDetectorEventType.SILENCE_START` before `SILENCE_END`');
          const realTimePassedSinceSilenceEnd =
            realTimePassedSinceEvent + volumeSmoothingCausedDelay;
          const intrinsicTimePassedSinceSilenceEnd = realTimePassedSinceSilenceEnd * clone.playbackRate;
          const silenceEndAtIntrinsicTime = clone.currentTime - intrinsicTimePassedSinceSilenceEnd;
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
      const currentlySounded = this.silenceSince == undefined;
      if (currentlySounded) {
        return;
      }
      // In case it's due to a seek to the end of the file, so we don't create a silence range of 0 length.
      if (this.silenceSince === clone.duration) {
        return;
      }
      assertDev(this.silenceSince);
      this.pushNewSilenceRange(
        this.silenceSince + this.settings.marginAfter,
        clone.duration,
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
    // TODO perf: but this can make `silenceRanges` [non-normalized](https://html.spec.whatwg.org/multipage/media.html#normalised-timeranges-object),
    // i.e. non-sorted and having overlapping (in our case, duplicate) entries.
    // However, the current implementation of `getMaybeSilenceRangeForTime` allows this.
    const seekClone = clone.fastSeek
      ? (seekTo: MediaTime) => clone.fastSeek(seekTo)
      : (seekTo: MediaTime) => { clone.currentTime = seekTo };
    const seekCloneIfOriginalElIsPlayingUnprocessedRange = () => {
      const originalElementTime = originalElement.currentTime;
      // TODO fix: Since the `HTMLMediaElement` may be reusable
      // (`isCloneElementAndAudioContextReusable`), its `played` ranges may already be populated,
      // so we can't rely on them. So we may actually skip performing a seek here even though
      // it may be necessary.
      // I don't know of a way to reset `played` for an element without re-loading its source.
      // We probably need to make a custom `played` implementation that is
      // specific to a `Lookahead` instance.
      // Or, we can say that it's not a bug but a feature and that if you change some
      // skipping settings (leading to `Lookahead` re-initialization) and seek back the video
      // then it's not gonna skip silnece because "well I thought you seeked back because
      // you wanted to thoriughly re-watch some part".
      //
      // TODO fix: `clone.played` doesn't mean that we've actually played back that part.
      // E.g. if you play a video in Odysee then reload the page such that the video starts
      // playing from the middle then this is gonna say that it `played` it from start to middle.
      const playingUnprocessedRange = !inRanges(clone.played, originalElementTime);
      if (!playingUnprocessedRange) {
        return;
      }
      // Keep in mind that `originalElement.seeking` could be `true`, so make sure not to repeatedly
      // call this so that it gets stuck in that state.
      // TODO improvement: call `pushNewSilenceRange` before seeking if it's silence currently?
      seekClone(originalElementTime);
      // To avoid the case where it's currently silence, then you seek forward a lot and it's loud so it marks
      // the whole range that you skipped as silence.
      // TODO refactor: it seems to me that it would be cleaner to somehow reset the state of
      // `silenceDetector` instead so if there is silence where we seek, it will emit
      // `SILENCE_START` even if the last thing it emited too was `SILENCE_START`.
      const currentlySilence = this.silenceSince != undefined;
      if (currentlySilence) {
        this.silenceSince = originalElementTime;
      }
    }
    // TODO perf: also utilize `requestIdleCallback` so it gets called less frequently during high loads?
    // TODO perf: we could instead detach the listener and attach it again after one second.
    const throttledSeekCloneIfPlayingUnprocessedRange = throttle(seekCloneIfOriginalElIsPlayingUnprocessedRange, 1000);
    if (isCloneElementAndAudioContextReusable) {
      // A somewhat of a workaround for the `played` thing (see the comment about it above).
      // Ensure that even if the current range is `played` by clone, we start processing
      // it anyway, at least until the next `seekCloneIfOriginalElIsPlayingUnprocessedRange`
      // (which currently happens when the original element is 'seeking').
      seekClone(originalElement.currentTime);
    } else {
      throttledSeekCloneIfPlayingUnprocessedRange();
    }
    // TODO refactor: are there other cases when the clone can get out of sync?
    // the media load algorithm, but we re-create the Lookahead in that case.
    // Anything else? Maybe search the spec for "set the (current|official) playback position".
    originalElement.addEventListener('seeking', throttledSeekCloneIfPlayingUnprocessedRange, { passive: true });
    this._destroyedPromise.then(() => {
      originalElement.removeEventListener('seeking', throttledSeekCloneIfPlayingUnprocessedRange);
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
        // silence there is and other stuff. Also on `clone.buffered`? Especially useful for the
        // `MediaSource` cloning algorithm where the clone's `buffered` range is the same as
        // the original element's `buffered` range so it can't run ahead too much, only as far as
        // `buffered` goes.
        // Maybe also on for how long we can't keep up?
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

        /**
         * Yeah, looks like a naming/abstraction issue, we're not supposed to be able to say
         * whether the clone is unable to get far ahead of the original element just based
         * on the fact that it's reusable. It's just me knowing that if it's reusable then
         * it means that it's `MediaSource` clone based.
         * TODO refactor?
         */
        const cloneCanNotPlayFarAheadOfOriginal = isCloneElementAndAudioContextReusable;
        const zeroSpeedAt = cloneCanNotPlayFarAheadOfOriginal
          ? (2 * 60)
          : (3 * 60);
        // If the clone element can't get far ahead of the original one in terms of playback
        // position, it happens more often that `aheadSeconds` is not high enough to the
        // point that we don't see the next silence range. And silence range detection
        // accuracy goes down as the clone playback increases.
        // So, here's sort of a workaround to make sure that playback rate is never too big.
        const maxClonePlaybackRate = cloneCanNotPlayFarAheadOfOriginal
          ? maxClonePlaybackRateWhenMediaSourceSrc
          : maxClonePlaybackRateDefault;
        // Speed is max when 0 seconds ahead and is 0 when `zeroSpeedAt` ahead
        // (but we'll clamp it, below).

        const playbackRateUnclamped = maxClonePlaybackRate * (1 - (aheadSeconds / zeroSpeedAt));
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
    // TODO refactor: get rid of the only occurence of `this.clone`? Or shall we keep it?
    return getRealtimeMargin(this.settings.marginAfter + this.settings.marginBefore, this.clone!.playbackRate);
  }

  /**
   * Can be called before `ensureInit` has finished.
   * @returns The closest silent range that comes after `time`, or,
   *    if `time` falls into a silence range, that range is returned.
   *    `undefined` if there's no next silence range.
   *    `isPending` is `true` when the silence range's end time
   *    is not completely determined yet,
   *    in which case the end time of the silent range says _at least_
   *    how long the silent range is, i.e. it's actially gonna be longer
   *    when it is determined, but we know that this range is safe to skip.
   */
  public getNextSilenceRange(
    time: MediaTime
  ): [TimeRange, isPending: boolean] | undefined {
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
    if (closestFutureEndI !== undefined) {
      const nextSilenceRange: TimeRange = [
        starts[closestFutureEndI],
        ends[closestFutureEndI],
      ];
      return [
        nextSilenceRange,
        false, // isPending
      ];
    }

    {
    // If there is a pending nextSilenceRange
    const { silenceSince } = this;
    const currentlySilence = silenceSince != undefined;
    if (!currentlySilence) {
      return undefined;
    }

    if (!this.clone) {
      return undefined;
    }

    const pendingSilenceRangeEnd =
      this.clone.currentTime -
      this.settings.marginBefore -
      // Take into account the fact that it might already be a sounded part,
      // but we just haven't received the message from the `SilenceDetector`,
      // so let's be conservative here.
      0.05;

    if (time < pendingSilenceRangeEnd) {
      return [
        [silenceSince + this.settings.marginAfter, pendingSilenceRangeEnd],
        true, // isPending
      ];
    }
    }

    // `time` is past all the ranges.
    return undefined;
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
        // TODO refactor: we call `pushNewSilenceRange` regardless of whether
        // the silence was long enough to be skipped given `marginBefore` and
        // `marginAfter`, so this warning is giving false alarms.
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
