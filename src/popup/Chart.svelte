<script lang="ts">
  import { onMount } from 'svelte';
  import type { SmoothieChart, TimeSeries } from '@wofwca/smoothie';
  import {
    assertDev, /* SpeedName, */ SpeedName_SILENCE, SpeedName_SOUNDED, StretchInfo, AnyTime as TimeS,
    MediaTime, AudioContextTime, TimeDelta,
  } from '@/helpers';
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
  export let paused: boolean;

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

  async function initSmoothie() {
    const { SmoothieChart, TimeSeries } = await import(
      /* webpackPreload: true */
      /* webpackExports: ['SmoothieChart', 'TimeSeries'] */
      '@wofwca/smoothie' // TODO replace it with just 'smoothie' when it starts being released.
    );
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
      nonRealtimeData: true,
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
      strokeStyle: 'none',
      fillStyle: soundedSpeedColor,
    });
    smoothie.addTimeSeries(silenceSpeedSeries, {
      strokeStyle: 'none',
      fillStyle: silenceSpeedColor,
    });
    smoothie.addTimeSeries(stretchSeries, {
      strokeStyle: 'none',
      // fillStyle: 'rgba(0, 255, 0, 0.4)',
      fillStyle: soundedSpeedColor,
    })
    smoothie.addTimeSeries(shrinkSeries, {
      strokeStyle: 'none',
      // fillStyle: 'rgba(255, 0, 0, 0.4)',
      fillStyle: silenceSpeedColor,
    })
    smoothie.addTimeSeries(volumeSeries, {
      // RGB taken from Audacity.
      interpolation: 'linear',
      lineWidth: 1,
      strokeStyle: 'rgba(100, 100, 220, 0)',
      fillStyle: 'rgba(100, 100, 220, 0.8)',
    });
    smoothie.addTimeSeries(volumeThresholdSeries, {
      lineWidth: 2,
      strokeStyle: '#f44',
      fillStyle: 'transparent',
    });
    if (PLOT_STRETCHER_DELAY) {
      smoothie.addTimeSeries(stretcherDelaySeries, {
        interpolation: 'linear',
        lineWidth: 1,
        strokeStyle: 'purple',
        fillStyle: 'transparent',
      });
    }
    
    const canvasContext = canvasEl.getContext('2d')!;

    /**
     * Why need this? Because `latestTelemetryRecord.intrinsicTime` doesn't get updated often enough.
     * If we simply used `r.intrinsicTime`, the chart would be jumpy.
     */
    function getExpectedElementCurrentTime(r: TelemetryRecord): MediaTime {
      const telemetryRecordUpdatedAt = r.unixTime;
      const telemetryRecordAge = Date.now() / 1000 - telemetryRecordUpdatedAt;
      const lastReportedIntrinsicTime = r.intrinsicTime;
      const playbackRate = r.lastActualPlaybackRateChange.value;
      const expectedTime = lastReportedIntrinsicTime + telemetryRecordAge * playbackRate;
      return expectedTime;
    }

    (function drawAndScheduleAnother() {
      if (!paused && latestTelemetryRecord) {
        const time = sToMs(getExpectedElementCurrentTime(latestTelemetryRecord));
        smoothie.render(canvasEl, time);

        // The main algorithm may introduce a delay. This is to display what sound is currently on the output.
        // Not sure if this is a good idea to use the canvas both directly and through a library. If anything bad happens,
        // check out the commit that introduced this change – we were drawing this marker by smoothie's means before.
        // TODO this is now incorrect.
        const x = widthPx - sToMs(totalOutputDelay) / millisPerPixel;
        canvasContext.beginPath();
        canvasContext.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        canvasContext.moveTo(x, 0);
        canvasContext.lineTo(x, heightPx);
        canvasContext.closePath();
        canvasContext.stroke();
      }

      requestAnimationFrame(drawAndScheduleAnother);
    })();
  }
  onMount(initSmoothie);

  type TimeMs = number;
  function sToMs(seconds: TimeS): TimeMs {
    return seconds * 1000;
  }
  /*
  function toUnixTime(audioContextTime: TimeS, anyTelemetryRecord: TelemetryRecord) {
    // TODO why don't we just get rid of all audio context time references in the telemetry object and just use Unix
    // time everywhere?
    const audioContextCreationTimeUnix = anyTelemetryRecord.unixTime - anyTelemetryRecord.contextTime;
    return audioContextCreationTimeUnix + audioContextTime;
  }
  function toUnixTimeMs(...args: Parameters<typeof toUnixTime>) {
    return sToMs(toUnixTime(...args));
  }
  */

  let prevPlaybackRateChange: TelemetryRecord['lastActualPlaybackRateChange'] | undefined;
  // I have a feeling there is a way to make this simplier by doing this in the controller.
  function toIntrinsicTime(
    targetTime: AudioContextTime,
    telemetryRecord: TelemetryRecord,
    prevSpeedChange: TelemetryRecord['lastActualPlaybackRateChange'] | undefined,
  ) {
    // Keep in mind that due to the fact that you can seek a media element, several different `targetTime`s
    // can correspond to the same `el.currentTime`.
    const lastSpeedChange = telemetryRecord.lastActualPlaybackRateChange;
    let intrinsicTimeDelta: TimeDelta;
    const targetTimeIsWithinCurrentSpeed = targetTime >= lastSpeedChange.time;
    if (targetTimeIsWithinCurrentSpeed) {
      const realTimeDelta = targetTime - telemetryRecord.contextTime;
      intrinsicTimeDelta = realTimeDelta * lastSpeedChange.value;
    } else {
      if (process.env.NODE_ENV !== 'production') {
        if (prevSpeedChange && (targetTime < prevSpeedChange.time)) {
          console.error('Cannot determine intrinsicTime because `targetTime` is before the earliest'
            + ' playbackRateChange record.')
        }
      }
      const currentSpeedRealTimeDelta = lastSpeedChange.time - telemetryRecord.contextTime;
      const currentSpeedIntrinsicTimeDelta = currentSpeedRealTimeDelta * lastSpeedChange.value;
      intrinsicTimeDelta = currentSpeedIntrinsicTimeDelta;
      const prevSpeedRealTimeDelta = targetTime - lastSpeedChange.time;
      let prevSpeed;
      if (prevSpeedChange) {
        prevSpeed = prevSpeedChange.value;
      } else {
        // TODO currently this can happen, just as when you open the popup. But the consequences are tolerable.
        // Should we put `prevSpeedChange` in `TelemetryMessage`? Or maybe make it so that this function does not get
        // called when `prevSpeedChange` is `undefined`?
        // if (process.env.NODE_ENV !== 'production') {
        //   console.warn('`prevSpeedChange` is `undefined`');
        // }
        prevSpeed = 1;
      }
      const prevSpeedIntrinsicTimeDelta = prevSpeedRealTimeDelta * prevSpeed;
      intrinsicTimeDelta += prevSpeedIntrinsicTimeDelta;
    }
    return telemetryRecord.intrinsicTime + intrinsicTimeDelta;
  }
  function toIntrinsicTimeMs(...args: Parameters<typeof toIntrinsicTime>) {
    return sToMs(toIntrinsicTime(...args));
  }
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
    appendToSpeedSeries(toIntrinsicTimeMs(r.lastActualPlaybackRateChange.time, r, prevPlaybackRateChange), speedName);
    appendToSpeedSeries(unreachableFutureMomentMs, speedName);
  };

  function updateStretchAndAdjustSpeedSeries(newTelemetryRecord: TelemetryRecord) {
    assertDev(newTelemetryRecord.lastScheduledStretchInputTime,
      'Attempted to update stretch series, but stretch is not defined');
    const stretch = newTelemetryRecord.lastScheduledStretchInputTime;
    const stretchStartIntrinsicMs = toIntrinsicTimeMs(stretch.startTime, newTelemetryRecord, prevPlaybackRateChange);
    const stretchEndIntrinsicMs = toIntrinsicTimeMs(stretch.endTime, newTelemetryRecord, prevPlaybackRateChange);
    const stretchOrShrink = stretch.endValue > stretch.startValue
      ? 'stretch'
      : 'shrink';
    const series = stretchOrShrink === 'stretch'
      ? stretchSeries
      : shrinkSeries;
    series.append(stretchStartIntrinsicMs, offTheChartsValue);
    series.append(stretchEndIntrinsicMs, 0);

    // Don't draw actual video playback speed at that period so they don't overlap with stretches.
    const actualPlaybackRateDuringStretch = stretchOrShrink === 'shrink'
      ? 'sounded'
      : 'silence';
    silenceSpeedSeries.append(stretchStartIntrinsicMs, 0);
    soundedSpeedSeries.append(stretchStartIntrinsicMs, 0);
    // We don't have to restore the actual speed line's value after the stretch end, because stretches are always
    // followed by a speed change (at least at the moment of writing this).
  }

  let totalOutputDelay = 0;
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
    const inputTime = r.intrinsicTime - r.delayFromInputToStretcherOutput; // TODO now it's incorrect.
    stretcherDelaySeries.append(sToMs(inputTime), scaledValue);
  }

  let lastHandledTelemetryRecord: TelemetryRecord | undefined;
  function onNewTelemetry(newTelemetryRecord: TelemetryRecord | undefined) {
    if (!smoothie || !newTelemetryRecord) {
      return;
    }
    const r = newTelemetryRecord;

    (function updateVolumeSeries() {
      volumeSeries.append(sToMs(r.intrinsicTime), r.inputVolume)
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

      prevPlaybackRateChange = lastHandledTelemetryRecord?.lastActualPlaybackRateChange;
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

    totalOutputDelay = r.totalOutputDelay;
    if (PLOT_STRETCHER_DELAY) {
      updateStretcherDelaySeries(r);
    }

    lastHandledTelemetryRecord = newTelemetryRecord;
  }
  $: onNewTelemetry(latestTelemetryRecord);

  function updateSmoothieVolumeThreshold() {
    volumeThresholdSeries.clear();
    // Not sure if using larger values makes it consume more memory.
    volumeThresholdSeries.append(0, volumeThreshold);
    volumeThresholdSeries.append(unreachableFutureMomentMs, volumeThreshold);
  }
  $: if (smoothie) {
    volumeThreshold;
    updateSmoothieVolumeThreshold()
  }
</script>

<canvas
  bind:this={canvasEl}
  width={widthPx}
  height={heightPx}
  on:click
  style={paused ? 'opacity: 0.2' : ''}
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
</style>
