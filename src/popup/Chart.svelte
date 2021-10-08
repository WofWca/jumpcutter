<script lang="ts">
  import { onMount } from 'svelte';
  import type { SmoothieChart, TimeSeries } from '@wofwca/smoothie';
  import {
    assertDev, /* SpeedName, */ SpeedName_SILENCE, SpeedName_SOUNDED, StretchInfo, AnyTime as TimeS,
    MediaTime, AudioContextTime, TimeDelta, AnyTime,
  } from '@/helpers';
  import { Settings } from '@/settings';
  import type { TelemetryRecord } from '@/content/StretchingController/StretchingController';
  import debounce from 'lodash/debounce';

  // TODO make this an option. Scaling in `updateStretcherDelaySeries` may require some work though.
  const PLOT_STRETCHER_DELAY = process.env.NODE_ENV !== 'production' && true;

  export let latestTelemetryRecord: TelemetryRecord | undefined;
  export let volumeThreshold: number;
  export let loadedPromise: Promise<any>;
  export let widthPx: number;
  export let heightPx: number;
  export let lengthSeconds: number;
  export let jumpPeriod: number;
  $: jumpPeriodMs = jumpPeriod * 1000;
  export let timeProgressionSpeed: Settings['popupChartSpeed']; // Non-reactive
  export let paused: boolean;
  export let telemetryUpdatePeriod: TimeDelta;

  const timeProgressionSpeedIntrinsic = timeProgressionSpeed === 'intrinsicTime';

  let canvasEl: HTMLCanvasElement;
  $: millisPerPixel = lengthSeconds * 1000 / widthPx;

  $: lastVolume = latestTelemetryRecord?.inputVolume ?? 0;

  let smoothie: SmoothieChart | undefined;
  let volumeSeries: TimeSeries;
  // Need two series because they're of different colors.
  let soundedSpeedSeries: TimeSeries;
  let silenceSpeedSeries: TimeSeries;
  // Using series for this instead of `options.horizontalLines` because horizontal lines are always on behind the data
  // lines, so it's poorly visible.
  let volumeThresholdSeries: TimeSeries;
  let stretcherDelaySeries: TimeSeries

  let stretchSeries: TimeSeries;
  let shrinkSeries: TimeSeries;

  const bestYAxisRelativeVolumeThreshold = 1/6;
  let chartMaxValue: number;
  function setMaxChartValueToBest() {
    chartMaxValue = volumeThreshold / bestYAxisRelativeVolumeThreshold
  }
  const debouncedSetMaxChartValueToBest = debounce(setMaxChartValueToBest, 3000);
  setMaxChartValueToBest();
  $: {
    volumeThreshold;
    debouncedSetMaxChartValueToBest();
  }
  $: meterMaxValue = volumeThreshold / bestYAxisRelativeVolumeThreshold;

  const smoothieImportP = import(
    /* webpackPreload: true */
    /* webpackExports: ['SmoothieChart', 'TimeSeries'] */
    '@wofwca/smoothie' // TODO replace it with just 'smoothie' when it starts being released.
  );

  type TimeMs = number;
  function sToMs(seconds: TimeS): TimeMs {
    return seconds * 1000;
  }
  function toUnixTime(audioContextTime: TimeS, anyTelemetryRecord: TelemetryRecord) {
    // TODO why don't we just get rid of all audio context time references in the telemetry object and just use Unix
    // time everywhere?
    const audioContextCreationTimeUnix = anyTelemetryRecord.unixTime - anyTelemetryRecord.contextTime;
    return audioContextCreationTimeUnix + audioContextTime;
  }
  function toUnixTimeMs(...args: Parameters<typeof toUnixTime>) {
    return sToMs(toUnixTime(...args));
  }

  let prevPlaybackRateChange: TelemetryRecord['lastActualPlaybackRateChange'] | undefined;
  // I have a feeling there is a way to make this simplier by doing this in the controller.
  /**
   * @param targetTime - can be no earlier than the third latest actualPlaybackRateChange.
   */
  function toIntrinsicTime(
    targetTime: AudioContextTime,
    telemetryRecord:
      Pick<TelemetryRecord, 'unixTime' | 'contextTime' | 'intrinsicTime' | 'lastActualPlaybackRateChange'>,
    prevSpeedChange: TelemetryRecord['lastActualPlaybackRateChange'] | undefined,
  ) {
    // Keep in mind that due to the fact that you can seek a media element, several different `targetTime`s
    // can correspond to the same `el.currentTime`.
    const lastSpeedChange = telemetryRecord.lastActualPlaybackRateChange;
    let intrinsicTimeDelta: TimeDelta = 0;

    if (process.env.NODE_ENV !== 'production') {
      if (prevSpeedChange && (prevSpeedChange.time >= lastSpeedChange.time)) {
        // However this check doesn't catch whether it was _immediately_ before, only if it's just _before_.
        console.error('`prevSpeedChange` must be the speed change that was immediately before'
          + ' `telemetryRecord.lastActualPlaybackRateChange`');
      }
    }

    // From latest to oldest.
    for (
      let speedChangeInd = 0,
        speedChange,
        nextSpeedChange, // By "next" we mean next in time.
        targetTimeIsWithinCurrentSpeed = false;

      !targetTimeIsWithinCurrentSpeed;

      nextSpeedChange = speedChange, speedChangeInd--
    ) {
      // TODO weels like this can be much simplier and more efficient.
      switch (speedChangeInd) {
        case 0: speedChange = lastSpeedChange; break;
        case -1: {
          if (prevSpeedChange) {
            speedChange = prevSpeedChange;
          } else {
            // TODO currently this can happen, just as when you open the popup. But the consequences are tolerable.
            // Should we put `prevSpeedChange` in `TelemetryMessage`? Or maybe make it so that this function does
            // not get called when `prevSpeedChange` is `undefined`?
            // TODO also don't create a new object for performance?
            speedChange = {
              time: Number.MIN_VALUE, // To guarantee `targetTimeIsWithinCurrentSpeed` being to `true`.
              value: 1,
            };
          }
          break;
        }
        case -2: {
          // We don't have the actual record (but maybe we should?), we just assume it. It's good enough for this
          // function's contract.
          // When I wrote this, the [2]nd speed change was only required for output delay calculations.
          speedChange = {
            time: Number.MIN_VALUE,
            value: lastSpeedChange.value,
          }
          break;
        }
        default: throw Error();
      }

      targetTimeIsWithinCurrentSpeed = targetTime >= speedChange.time;
      const currSpeedSnippetUntil = nextSpeedChange?.time ?? telemetryRecord.contextTime;
      const currSpeedSnippetFrom = Math.max(speedChange.time, targetTime);
      const currSpeedRealimeDelta = currSpeedSnippetFrom - currSpeedSnippetUntil;
      const currentSpeedIntrinsicTimeDelta = currSpeedRealimeDelta * speedChange.value;
      intrinsicTimeDelta += currentSpeedIntrinsicTimeDelta;
    }
    return telemetryRecord.intrinsicTime + intrinsicTimeDelta;
  }
  function toIntrinsicTimeMs(...args: Parameters<typeof toIntrinsicTime>) {
    return sToMs(toIntrinsicTime(...args));
  }

  const convertTime = timeProgressionSpeedIntrinsic
    ? toIntrinsicTime
    : toUnixTime;
  const convertTimeMs = timeProgressionSpeedIntrinsic
    ? toIntrinsicTimeMs
    : toUnixTimeMs;

  async function initSmoothie() {
    const { SmoothieChart, TimeSeries } = await smoothieImportP;
    // TODO make all these numbers customizable.
    smoothie = new SmoothieChart({
      millisPerPixel, // TODO make it reactive?
      interpolation: 'step',
      // responsive: true, ?
      grid: {
        fillStyle: '#fff',
        strokeStyle: '#aaa',
        verticalSections: 0,
        millisPerLine: 1000,
        sharpLines: true,
      },
      labels: {
        disabled: true,
      },
      // This doesn't matter as we manually call `.render` anyway.
      // nonRealtimeData: timeProgressionSpeedIntrinsic, 
      minValue: 0,
      yRangeFunction() {
        if (volumeThreshold > 0) {
          const maxYAxisRelativeVolumeThreshold = 0.95;
          const minYAxisRelativeVolumeThreshold = 0.05;
          const yAxisRelativeVolumeThreshold = volumeThreshold / chartMaxValue;
          if (
            yAxisRelativeVolumeThreshold > maxYAxisRelativeVolumeThreshold
            || yAxisRelativeVolumeThreshold < minYAxisRelativeVolumeThreshold
          ) {
            setMaxChartValueToBest();
          }
          return { min: 0, max: chartMaxValue };
        } else {
          return { min: 0, max: volumeSeries.maxValue };
        }
      },
    });
    smoothie.streamTo(canvasEl);
    smoothie.stop();

    loadedPromise.then(() => {
      setMaxChartValueToBest();
      // So it doesn't play the scaling animation.
      const scaleSmoothing = smoothie!.options.scaleSmoothing;
      smoothie!.options.scaleSmoothing = 1;
      smoothie!.render();
      smoothie!.options.scaleSmoothing = scaleSmoothing;
    });

    volumeSeries = new TimeSeries();
    soundedSpeedSeries = new TimeSeries();
    silenceSpeedSeries = new TimeSeries();
    volumeThresholdSeries = new TimeSeries();
    if (PLOT_STRETCHER_DELAY) {
      stretcherDelaySeries = new TimeSeries();
    }
    stretchSeries = new TimeSeries();
    shrinkSeries = new TimeSeries();
    // Order determines z-index
    const soundedSpeedColor = 'rgba(0, 255, 0, 0.3)';
    const silenceSpeedColor = 'rgba(255, 0, 0, 0.3)';
    smoothie.addTimeSeries(soundedSpeedSeries, {
      strokeStyle: undefined,
      fillStyle: soundedSpeedColor,
    });
    smoothie.addTimeSeries(silenceSpeedSeries, {
      strokeStyle: undefined,
      fillStyle: silenceSpeedColor,
    });
    smoothie.addTimeSeries(stretchSeries, {
      strokeStyle: undefined,
      // fillStyle: 'rgba(0, 255, 0, 0.4)',
      fillStyle: soundedSpeedColor,
    })
    smoothie.addTimeSeries(shrinkSeries, {
      strokeStyle: undefined,
      // fillStyle: 'rgba(255, 0, 0, 0.4)',
      fillStyle: silenceSpeedColor,
    })
    smoothie.addTimeSeries(volumeSeries, {
      // RGB taken from Audacity.
      interpolation: 'linear',
      // lineWidth: 1,
      // strokeStyle: 'rgba(100, 100, 220, 0)',
      strokeStyle: undefined,
      fillStyle: 'rgba(100, 100, 220, 0.8)',
    });
    smoothie.addTimeSeries(volumeThresholdSeries, {
      lineWidth: 2,
      strokeStyle: '#f44',
    });
    if (PLOT_STRETCHER_DELAY) {
      smoothie.addTimeSeries(stretcherDelaySeries, {
        interpolation: 'linear',
        lineWidth: 1,
        strokeStyle: 'purple',
      });
    }

    let referenceTelemetry: Parameters<typeof toIntrinsicTime>[1] | undefined;
    /**
     * Why need this? Because:
     * * `latestTelemetryRecord` doesn't get updated often enough.
     * * `latestTelemetryRecord.intrinsicTime`, `.contextTime` and `.unixTime` are not precise enough, they're jumpy.
     *   I believe it may be intentional browser behavior to mitigate timing attacks
     *   (https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime#reduced_time_precision)
     *   Try this, for example:
     *   `ctx = new AudioContext(); setInterval(() => console.log(performance.now() - ctx.currentTime * 1000), 50)`
     *   You'll see the printed value is fluctuating.
     * If we simply used `r.intrinsicTime`, the chart would be jumpy. Instead we take a `TelemetryRecord`
     * (referenceTelemetry) and calculate the `el.currentTime` based on it, using `Date.now()`, as it is smoother.
     * Why is it "Delayed"? See the comment about `delayToAvoidExtrapolationRealTime`.
     */
    function getExpectedElementCurrentTimeDelayed(
      r: TelemetryRecord,
      referenceTelemetry: Parameters<typeof toIntrinsicTime>[1] | undefined,
      onNeedToUpdateReference: () => void,
    ): MediaTime {
      // We need to introduce a delay in order to avoid extrapolation (as opposed to interpolation) as it may
      // be wrong because the speed may change immediately after a `TelemetryRecord` was sent.
      // So the delay must be at least the amount of time until the next `TelemetryRecord`.
      // But if the next `TelemetryRecord` did not come by that time for some reason (high CPU load, etc)
      // we need fall back to extrapolation.
      // At the same time the delay must be small in order for:
      // * the user to see it quicker
      // * the `toIntrinsicTime` function's contract to not be breached (i.e. `targetTime` is not too early).
      const delayToAvoidExtrapolationRealTime = telemetryUpdatePeriod;

      if (!r.elementPlaybackActive) {
        // TODO this is incorrect if the speed recently changed. Good enoguh though.
        const delayToAvoidExtrapolationIntrinsicTime
          = delayToAvoidExtrapolationRealTime * r.lastActualPlaybackRateChange.value;
        return r.intrinsicTime - delayToAvoidExtrapolationIntrinsicTime;
      }

      const delayToAvoidExtrapolationRealTimeMs = delayToAvoidExtrapolationRealTime * 1000;
      const targetTimeUnix = (Date.now() - delayToAvoidExtrapolationRealTimeMs) / 1000;
      // TODO make sure this conversion doesn't add error, as with (`el.currentTime`). Or get rid of it by making
      // `toIntrinsicTime` accept `targetTime` as `UnixTime`, not just `AudioContextTime`.
      const targetTimeAudioContextTimeBasedOnLatest = r.contextTime + (targetTimeUnix - r.unixTime);

      const expectedTimeBasedOnLatest
        = toIntrinsicTime(targetTimeAudioContextTimeBasedOnLatest, r, prevPlaybackRateChange);
      const speedChangedSinceReference =
        !referenceTelemetry
        || referenceTelemetry.lastActualPlaybackRateChange.time !== r.lastActualPlaybackRateChange.time;
      // Technically considering the fact that there is `delayToAvoidExtrapolationRealTime`,
      // `referenceTelemetry` is not immediately invalid after the speed changed in the new telemetry,
      // but rather only after `targetTimeUnix > r.lastActualPlaybackRateChange.time`, but this does not
      // appear to cause trouble right now, I believe this only leads to the chart jump happening a bit earlier.
      // TODO? Maybe just rename it to `speedChangingSoonSoReferenceWillBeInvalid` for now?
      if (!speedChangedSinceReference) { // Otherwise the reference is incorrect.
        assertDev(referenceTelemetry); // `speedChangedSinceReference` would be `true` otherwise.
        const targetTimeAudioContextTimeBasedOnReference
          = referenceTelemetry.contextTime + (targetTimeUnix - referenceTelemetry.unixTime);
        const expectedTimeBasedOnReference
          = toIntrinsicTime(targetTimeAudioContextTimeBasedOnReference, referenceTelemetry, prevPlaybackRateChange);
        // You would think that this is pretty big of a margin and e.g. if there is a seek that is smaller
        // than this, it would not get noticed (for example, desync correction can take
        // less than that), but this function (at least when I wrote this) is only responsible for how fast the
        // chart is moving - it plays no role in `timeSeries.append(` arguments.
        // The actual average error appears to be around 0.0008s for Chromium and 0.005s for Gecko for me.
        const maxAllowedError = 0.25;
        const referenceIsCorrect = Math.abs(expectedTimeBasedOnReference - expectedTimeBasedOnLatest) < maxAllowedError;
        if (referenceIsCorrect) {
          return expectedTimeBasedOnReference;
        }
      }
      // Then the reference is incorrect.
      onNeedToUpdateReference();
      return expectedTimeBasedOnLatest;
    }
    const setReferenceToLatest = () => {
      assertDev(latestTelemetryRecord);
      referenceTelemetry = latestTelemetryRecord;
    };

    const canvasContext = canvasEl.getContext('2d')!;
    (function drawAndScheduleAnother() {
      if (!paused && latestTelemetryRecord) {
        let time = timeProgressionSpeedIntrinsic
          ? sToMs(getExpectedElementCurrentTimeDelayed(
              latestTelemetryRecord,
              referenceTelemetry,
              setReferenceToLatest,
            ))
            // Otherwise if the returned value is 0, smoothie will behave as if the `time` parameter
            // was omitted.
            || Number.MIN_SAFE_INTEGER
          : Date.now();

        type SmoothieChartWithPrivateFields = SmoothieChart & {
          lastRenderTimeMillis: number,
          lastChartTimestamp: number | any,
        };

        // TODO always start at max offset so we don't jump almost immediately as the popup opens?
        const chartJumpingOffsetMs =
          jumpPeriodMs // Because it may be zero and `number % 0 === NaN`.
          && (jumpPeriodMs - time % jumpPeriodMs);
        // FYI There's also `smoothie.delay = -chartJumpingOffsetMs`, but it doesn't work rn.
        time += chartJumpingOffsetMs;
        // This is a hack to get rid of the fact that smoothie won't `render` if it has been passed the
        // `time` the same as before (actually it would, but only 6 times per second).
        if (jumpPeriodMs !== 0) {
          (smoothie as SmoothieChartWithPrivateFields).lastChartTimestamp = null;
        }

        const renderTimeBefore = (smoothie as SmoothieChartWithPrivateFields).lastRenderTimeMillis;
        smoothie.render(canvasEl, time);
        const renderTimeAfter = (smoothie as SmoothieChartWithPrivateFields).lastRenderTimeMillis;
        const canvasRepainted = renderTimeBefore !== renderTimeAfter; // Not true for FPS > 1000.

        if (canvasRepainted) {
          // The main algorithm may introduce a delay. This is to display what sound is currently on the output.
          // Not sure if this is a good idea to use the canvas both directly and through a library. If anything bad
          // happens, check out the commit that introduced this change – we were drawing this marker by smoothie's
          // means before.
          let chartEdgeTimeOffset: TimeDelta;
          if (timeProgressionSpeedIntrinsic) {
            const momentCurrentlyBeingOutputContextTime = latestTelemetryRecord.contextTime - totalOutputDelayRealTime;
            const momentCurrentlyBeingOutputIntrinsicTime
              = toIntrinsicTime(momentCurrentlyBeingOutputContextTime, latestTelemetryRecord, prevPlaybackRateChange);
            const totalOutputDelayIntrinsicTime
              = latestTelemetryRecord.intrinsicTime - momentCurrentlyBeingOutputIntrinsicTime;
            // TODO this is incorrect because the delay introduced by `getExpectedElementCurrentTimeDelayed`
            // is not taken into account. But it's good enough, as that delay is unnoticeable currently.
            chartEdgeTimeOffset = totalOutputDelayIntrinsicTime;
          } else {
            chartEdgeTimeOffset = totalOutputDelayRealTime;
          }
          const pixelOffset = (sToMs(chartEdgeTimeOffset) + chartJumpingOffsetMs) / millisPerPixel;
          // So it's not smeared accross two pixels.
          const pixelOffsetCentered = Math.floor(pixelOffset) + 0.5;
          const x = widthPx - pixelOffsetCentered;
          canvasContext.save();
          canvasContext.beginPath();
          canvasContext.strokeStyle = jumpPeriodMs === 0
            ? 'rgba(0, 0, 0, 0.3)'
            // So it's more clearly visible as it's moving accross the screen.
            : 'rgba(0, 0, 0, 0.8)';
          canvasContext.moveTo(x, 0);
          canvasContext.lineTo(x, heightPx);
          canvasContext.closePath();
          canvasContext.stroke();
          canvasContext.restore();
        }
      }

      requestAnimationFrame(drawAndScheduleAnother);
    })();
  }
  onMount(initSmoothie);

  function appendToSpeedSeries(timeMs: TimeMs, speedName: TelemetryRecord['lastActualPlaybackRateChange']['name']) {
    soundedSpeedSeries.append(timeMs, speedName === SpeedName_SOUNDED ? offTheChartsValue : 0);
    silenceSpeedSeries.append(timeMs, speedName === SpeedName_SILENCE ? offTheChartsValue : 0);

    if (process.env.NODE_ENV !== 'production') {
      if (latestTelemetryRecord && (latestTelemetryRecord.inputVolume > offTheChartsValue)) {
        console.warn('offTheChartsValue is supposed to be so large tha it\'s beyond chart bonds so it just looks like'
          + ' background, but now it has been exceeded by inutVolume value');
      }
    }
  }

  // `+Infinity` doesn't appear to work, as well as `Number.MAX_SAFE_INTEGER`. Apparently because when the value is
  // too far beyond the chart bounds, the line is hidden.
  // Also just having a big value (like 1e6) causes gaps between the green and red speed backgrounds.
  // Let's make it 1, because currently we measure volume by simply computing RMS of samples, and no sample can have
  // value > 1.
  const offTheChartsValue = 1;
  // TimeSeries.append relies on this value being constant, because calling it with the very same timestamp overrides
  // the previous value on that time.
  // By 'unreachable' we mean that it's not going to be reached within the lifetime of the component.
  const unreachableFutureMomentMs = Number.MAX_SAFE_INTEGER;

  function updateSpeedSeries(newTelemetryRecord: TelemetryRecord) {
    const r = newTelemetryRecord;
    const speedName = r.lastActualPlaybackRateChange.name;
    appendToSpeedSeries(convertTimeMs(r.lastActualPlaybackRateChange.time, r, prevPlaybackRateChange), speedName);
    appendToSpeedSeries(unreachableFutureMomentMs, speedName);
  };

  function updateStretchAndAdjustSpeedSeries(newTelemetryRecord: TelemetryRecord) {
    assertDev(newTelemetryRecord.lastScheduledStretchInputTime,
      'Attempted to update stretch series, but stretch is not defined');
    const stretch = newTelemetryRecord.lastScheduledStretchInputTime;
    const stretchStartConvertedMs = convertTimeMs(stretch.startTime, newTelemetryRecord, prevPlaybackRateChange);
    const stretchEndConvertedMs = convertTimeMs(stretch.endTime, newTelemetryRecord, prevPlaybackRateChange);
    const stretchOrShrink = stretch.endValue > stretch.startValue
      ? 'stretch'
      : 'shrink';
    const series = stretchOrShrink === 'stretch'
      ? stretchSeries
      : shrinkSeries;
    series.append(stretchStartConvertedMs, offTheChartsValue);
    series.append(stretchEndConvertedMs, 0);

    // Don't draw actual video playback speed at that period so they don't overlap with stretches.
    const actualPlaybackRateDuringStretch = stretchOrShrink === 'shrink'
      ? 'sounded'
      : 'silence';
    silenceSpeedSeries.append(stretchStartConvertedMs, 0);
    soundedSpeedSeries.append(stretchStartConvertedMs, 0);
    // We don't have to restore the actual speed line's value after the stretch end, because stretches are always
    // followed by a speed change (at least at the moment of writing this).
  }

  let totalOutputDelayRealTime = 0;
  let maxRecordedStretcherDelay = 0;
  function updateStretcherDelaySeries(newTelemetryRecord: TelemetryRecord) {
    if (!PLOT_STRETCHER_DELAY) {
      return;
    }

    const r = newTelemetryRecord;
    const { stretcherDelay } = r;
    if (stretcherDelay === undefined) {
      return;
    }

    if (stretcherDelay > maxRecordedStretcherDelay) {
      maxRecordedStretcherDelay = stretcherDelay;
    }
    // Yes, old values' scale is not updated.
    const scaledValue = stretcherDelay / maxRecordedStretcherDelay * chartMaxValue * 0.90;
    const momentCurrentlyAtStretcherOutputAudioContextTime = r.contextTime - r.delayFromInputToStretcherOutput;
    stretcherDelaySeries.append(
      convertTimeMs(momentCurrentlyAtStretcherOutputAudioContextTime, newTelemetryRecord, prevPlaybackRateChange),
      scaledValue,
    );
  }


  /** An equivalent of `smoothie.prototype.dropOldData` */
  function timeSeriesDropFutureData(timeSeries: TimeSeries, newestValidTime: MediaTime) {
    type TimeSeriesWithPrivateFields = TimeSeries & {
      data: Array<[time: AnyTime, value: number]>,
    };
    const data = (timeSeries as TimeSeriesWithPrivateFields).data;
    const newestValidTimeMs = newestValidTime * 1000;
    const firstInvalidInd = data.findIndex(([time]) => time > newestValidTimeMs);
    if (firstInvalidInd < 0) return;
    data.splice(firstInvalidInd);
  }
  function smoothieDropFutureData(smoothie: SmoothieChart, newestValidTime: MediaTime) {
    type SmoothieWithPrivateFields = SmoothieChart & {
      seriesSet: Array<{ timeSeries: TimeSeries }>
    };
    for (const { timeSeries } of (smoothie as SmoothieWithPrivateFields).seriesSet) {
      timeSeriesDropFutureData(timeSeries, newestValidTime);
    }
  }

  let lastHandledTelemetryRecord: TelemetryRecord | undefined;
  function onNewTelemetry(newTelemetryRecord: TelemetryRecord | undefined) {
    if (!smoothie || !newTelemetryRecord) {
      return;
    }
    const r = newTelemetryRecord;
    const now = timeProgressionSpeedIntrinsic
      ? r.intrinsicTime
      : r.unixTime;

    // Not required with real-time speed, because real time alsways goes forward.
    if (timeProgressionSpeedIntrinsic) {
      // In case there has been a seek or something, remove the data that is in the future as it needs to be overridden.
      // If we don't do this:
      // * The volume line will look spikey
      // * If you constantly seek back so the same period is played over and over, all the datapoints will be clamped
      // in the same place, which would not be good for performance, I believe.
      // * Also if you seek back with a small step so that `currentTime` gets lower and lower, the old data will also
      // not get deleted, which would be considered a memory leak.
      //
      // TODO However this does not actually fully achieve what's needed because some data gets placed with at points
      // in time which are earlier than `r.intrinsicTime`, for example things that take output delay into account -
      // such as `stretcherDelaySeries`, so if you do a tiny seek back, the datapoints will still get clamped up.
      const newIntrinsicTimeIsEarlierThanPrevious
        = lastHandledTelemetryRecord && (lastHandledTelemetryRecord.intrinsicTime > r.intrinsicTime);
      if (newIntrinsicTimeIsEarlierThanPrevious) {
        smoothieDropFutureData(smoothie, r.intrinsicTime);

        // Reasons to `updateSpeedSeries`:
        // * If you seek far back (e.g. by a chart length), the green/red background would go away and not come back
        // until there is a new speed change.
        // * It uses `unreachableFutureMomentMs`, which gets removed on `smoothieDropFutureData`. Same with
        // `updateSpeedSeries`.
        updateSpeedSeries(r); // TODO perf: `updateSpeedSeries` may also get called a few lines below.
        updateSmoothieVolumeThreshold();
      }
    }

    (function updateVolumeSeries() {
      volumeSeries.append(sToMs(now), r.inputVolume)
    })();

    function arePlaybackRateChangeObjectsEqual(
      a: TelemetryRecord['lastActualPlaybackRateChange'] | undefined,
      b: TelemetryRecord['lastActualPlaybackRateChange'] | undefined,
    ) {
      return a?.time === b?.time;
    }
    const speedChanged = !arePlaybackRateChangeObjectsEqual(
      lastHandledTelemetryRecord?.lastActualPlaybackRateChange,
      newTelemetryRecord.lastActualPlaybackRateChange,
    );
    if (speedChanged) {
      updateSpeedSeries(r);

      // Otherwise it's not required.
      if (timeProgressionSpeedIntrinsic) {
        prevPlaybackRateChange = lastHandledTelemetryRecord?.lastActualPlaybackRateChange;
      }
    }

    function areStretchObjectsEqual(
      stretchA: StretchInfo | undefined | null,
      stretchB: StretchInfo | undefined | null,
    ) {
      return stretchA?.startTime === stretchB?.startTime;
    }
    const newStretch = r.lastScheduledStretchInputTime && !areStretchObjectsEqual(
      lastHandledTelemetryRecord?.lastScheduledStretchInputTime,
      r.lastScheduledStretchInputTime
    );
    if (newStretch) {
      updateStretchAndAdjustSpeedSeries(r);
    }

    totalOutputDelayRealTime = r.totalOutputDelay;
    if (PLOT_STRETCHER_DELAY) {
      updateStretcherDelaySeries(r);
    }

    lastHandledTelemetryRecord = newTelemetryRecord;
  }
  $: onNewTelemetry(latestTelemetryRecord);

  function updateSmoothieVolumeThreshold() {
    volumeThresholdSeries.clear();
    const timeBeforeChartStart = timeProgressionSpeedIntrinsic
      ? 0
      // For some reason using just `0` makes the line disappear. TODO investigate?
      : Date.now() - Math.round(lengthSeconds * 1000);
    // Not sure if using larger values makes it consume more memory.
    volumeThresholdSeries.append(timeBeforeChartStart, volumeThreshold);
    volumeThresholdSeries.append(unreachableFutureMomentMs, volumeThreshold);
  }
  $: if (smoothie) {
    volumeThreshold;
    updateSmoothieVolumeThreshold()
  }
</script>

<!-- Don't apply `style=` directly to the canvas because smoothie.js also internally does this. -->
<canvas
  bind:this={canvasEl}
  width={widthPx}
  height={heightPx}
  on:click
  class:paused
>
  <label>
    Volume
    <meter
      aria-label='volume'
      value={lastVolume}
      max={meterMaxValue}
    />
    <span
      aria-hidden='true'
    >{lastVolume.toFixed(3)}</span>
  </label>
</canvas>

<style>
  canvas {
    /* So it doesn't create additional margin around it. */
    display: block;
  }
  canvas.paused {
    opacity: 0.2;
  }
</style>
