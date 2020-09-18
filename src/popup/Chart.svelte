<script lang="ts">
  import { onMount } from 'svelte';
  import type { SmoothieChart, TimeSeries } from 'smoothie';
  import { assert, StretchInfo, Time as TimeS } from '@/helpers';
  import type Controller from '@/content/Controller';

  type TelemetryRecord = ReturnType<Controller['getTelemetry']>;
  export let latestTelemetryRecord: TelemetryRecord;
  export let volumeThreshold: number;
  export let loadedPromise: Promise<any>;

  let canvasEl: HTMLCanvasElement;
  const canvasWidth = 400;
  const millisPerPixel = 10;
  // May not be precise (and doesn't need to be currently).
  const bufferDurationMillliseconds = Math.ceil(canvasWidth * millisPerPixel);

  $: lastVolume = latestTelemetryRecord?.inputVolume ?? 0;

  let smoothie: SmoothieChart | undefined;
  let volumeSeries: TimeSeries;
  // Need two series because they're of different colors.
  let soundedSpeedSeries: TimeSeries;
  let silenceSpeedSeries: TimeSeries;
  // Using series for this instead of `options.horizontalLines` because horizontal lines are always on behind the data
  // lines, so it's poorly visible.
  let volumeThresholdSeries: TimeSeries;

  let stretchSeries: TimeSeries;
  let shrinkSeries: TimeSeries;

  // The main algorithm may introduce a delay. This is to display what sound is currently on the output.
  let currentOutputMarkSeries: TimeSeries;

  const bestYAxisRelativeVolumeThreshold = 1/6;
  let chartMaxValue: number;
  function setBestChartMaxValue() {
    chartMaxValue = volumeThreshold / bestYAxisRelativeVolumeThreshold
  }
  setBestChartMaxValue();
  $: meterMaxValue = volumeThreshold / bestYAxisRelativeVolumeThreshold;

  async function initSmoothie() {
    const { SmoothieChart, TimeSeries } = await import(
      /* webpackPreload: true */
      /* webpackExports: ['SmoothieChart', 'TimeSeries'] */
      'smoothie'
    );
    // TODO make all these numbers customizable.
    smoothie = new SmoothieChart({
      millisPerPixel,
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
        const maxYAxisRelativeVolumeThreshold = 0.95;
        const minYAxisRelativeVolumeThreshold = 0.05;
        const yAxisRelativeVolumeThreshold = volumeThreshold / chartMaxValue;
        if (
          yAxisRelativeVolumeThreshold > maxYAxisRelativeVolumeThreshold
          || yAxisRelativeVolumeThreshold < minYAxisRelativeVolumeThreshold
        ) {
          setBestChartMaxValue();
        }
        return { min: 0, max: chartMaxValue };
      },
    });
    smoothie.streamTo(canvasEl);

    loadedPromise.then(() => {
      setBestChartMaxValue();
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
    stretchSeries = new TimeSeries();
    shrinkSeries = new TimeSeries();
    currentOutputMarkSeries = new TimeSeries();
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
      lineWidth: 1,
      strokeStyle: 'rgba(100, 100, 220, 0)',
      fillStyle: 'rgba(100, 100, 220, 0.8)',
    });
    smoothie.addTimeSeries(currentOutputMarkSeries, {
      strokeStyle: 'rgba(0, 0, 0, 0.5)',
    })
    smoothie.addTimeSeries(volumeThresholdSeries, {
      lineWidth: 2,
      strokeStyle: '#f44',
      fillStyle: 'transparent',
    });
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
    soundedSpeedSeries.append(timeMs, speedName === 'sounded' ? offTheChartsValue : 0);
    silenceSpeedSeries.append(timeMs, speedName === 'silence' ? offTheChartsValue : 0);

    if (process.env.NODE_ENV !== 'production') {
      if (latestTelemetryRecord?.inputVolume > offTheChartsValue) {
        console.warn('offTheChartsValue is supposed to be so large tha it\'s beyond chart bonds so it just looks like'
          + ' background, but now it has been exceeded by inutVolume value');
      }
    }
  }

  // `+Infinity` doesn't appear to work, as well as `Number.MAX_SAFE_INTEGER`. Apparently because when the value is
  // too far beyond the chart bounds, the line is hidden.
  const offTheChartsValue = 9999;
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
    assert(!!newTelemetryRecord.lastScheduledStretchInputTime,
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

  let lastHandledTelemetryRecord: TelemetryRecord | undefined;
  function onNewTelemetry(newTelemetryRecord: TelemetryRecord) {
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

    lastHandledTelemetryRecord = newTelemetryRecord;
  }
  $: onNewTelemetry(latestTelemetryRecord);

  function updateSmoothieVolumeThreshold() {
    volumeThresholdSeries.clear();
    // Not sure if using larger values makes it consume more memory.
    volumeThresholdSeries.append(Date.now() - bufferDurationMillliseconds, volumeThreshold);
    volumeThresholdSeries.append(unreachableFutureMomentMs, volumeThreshold);
  }
  $: if (smoothie) {
    volumeThreshold;
    updateSmoothieVolumeThreshold()
  }

  (function updateCurrentOutputMarkAndScheduleAnother() {
    if (smoothie) {
      currentOutputMarkSeries!.clear();
      if (totalOutputDelay !== 0) {
        const currentOutputTimeMs = Date.now() - sToMs(totalOutputDelay);
        // Draw a vertical line.
        const offTheChartsPastMoment = currentOutputTimeMs - 1e8;
        currentOutputMarkSeries!.append(offTheChartsPastMoment, offTheChartsValue);
        currentOutputMarkSeries!.append(currentOutputTimeMs, 0);
      }
    }
    requestAnimationFrame(updateCurrentOutputMarkAndScheduleAnother);
  })();
</script>

<canvas
  bind:this={canvasEl}
  width=400
  height=200
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
