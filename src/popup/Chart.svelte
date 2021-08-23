<script lang="ts">
  import { onMount } from 'svelte';
  import type { SmoothieChart, TimeSeries } from '@wofwca/smoothie';
  import { assertDev, /* SpeedName, */ SpeedName_SILENCE, SpeedName_SOUNDED, StretchInfo, AnyTime as TimeS } from '@/helpers';
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
    (function drawAndScheduleAnother() {
      if (!paused) {
        smoothie.render();

        // The main algorithm may introduce a delay. This is to display what sound is currently on the output.
        // Not sure if this is a good idea to use the canvas both directly and through a library. If anything bad happens,
        // check out the commit that introduced this change – we were drawing this marker by smoothie's means before.
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
  function toUnixTime(audioContextTime: TimeS, anyTelemetryRecord: TelemetryRecord) {
    // TODO why don't we just get rid of all audio context time references in the telemetry object and just use Unix
    // time everywhere?
    const audioContextCreationTimeUnix = anyTelemetryRecord.unixTime - anyTelemetryRecord.contextTime;
    return audioContextCreationTimeUnix + audioContextTime;
  }
  function toUnixTimeMs(...args: Parameters<typeof toUnixTime>) {
    return sToMs(toUnixTime(...args));
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
    appendToSpeedSeries(toUnixTimeMs(r.lastActualPlaybackRateChange.time, r), speedName);
    appendToSpeedSeries(unreachableFutureMomentMs, speedName);
  };

  function updateStretchAndAdjustSpeedSeries(newTelemetryRecord: TelemetryRecord) {
    assertDev(newTelemetryRecord.lastScheduledStretchInputTime,
      'Attempted to update stretch series, but stretch is not defined');
    const stretch = newTelemetryRecord.lastScheduledStretchInputTime;
    const stretchStartUnixMs = toUnixTimeMs(stretch.startTime, newTelemetryRecord);
    const stretchEndUnixMs = toUnixTimeMs(stretch.endTime, newTelemetryRecord);
    const stretchOrShrink = stretch.endValue > stretch.startValue
      ? 'stretch'
      : 'shrink';
    const series = stretchOrShrink === 'stretch'
      ? stretchSeries
      : shrinkSeries;
    series.append(stretchStartUnixMs, offTheChartsValue);
    series.append(stretchEndUnixMs, 0);

    // Don't draw actual video playback speed at that period so they don't overlap with stretches.
    const actualPlaybackRateDuringStretch = stretchOrShrink === 'shrink'
      ? 'sounded'
      : 'silence';
    silenceSpeedSeries.append(stretchStartUnixMs, 0);
    soundedSpeedSeries.append(stretchStartUnixMs, 0);
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
    const inputTime = r.unixTime - r.delayFromInputToStretcherOutput;
    stretcherDelaySeries.append(sToMs(inputTime), scaledValue);
  }

  let lastHandledTelemetryRecord: TelemetryRecord | undefined;
  function onNewTelemetry(newTelemetryRecord: TelemetryRecord | undefined) {
    if (!smoothie || !newTelemetryRecord) {
      return;
    }
    const r = newTelemetryRecord;

    (function updateVolumeSeries() {
      volumeSeries.append(sToMs(r.unixTime), r.inputVolume)
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
    volumeThresholdSeries.append(Date.now() - Math.round(lengthSeconds * 1000), volumeThreshold);
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
