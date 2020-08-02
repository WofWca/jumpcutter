<script>
  import { onMount } from 'svelte';

  export let latestTelemetryRecord;
  export let volumeThreshold;

  let canvasEl;
  const canvasWidth = 400;
  const millisPerPixel = 10;
  // May not be precise (and doesn't need to be currently).
  const bufferDurationMillliseconds = Math.ceil(canvasWidth * millisPerPixel);

  $: lastVolume = latestTelemetryRecord && latestTelemetryRecord.inputVolume || 0;

  let smoothie;
  let volumeSeries;
  // Need two series because they're of different colors.
  let soundedSpeedSeries;
  let silenceSpeedSeries;
  // Using series for this instead of `options.horizontalLines` because horizontal lines are always on behind the data
  // lines, so it's poorly visible.
  let volumeThresholdSeries;
  async function initSmoothie() {
    const { SmoothieChart, TimeSeries } = await import(
      /* webpackPreload: true */
      /* webpackExports: ['SmoothieChart', 'TimeSeries'] */
      'smoothie'
    );
    // TODO make all these numbers customizable.
    smoothie = new SmoothieChart({
      millisPerPixel,
      interpolation: 'linear',
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
      scaleSmoothing: 1,
    });
    smoothie.streamTo(canvasEl, );
    volumeSeries = new TimeSeries();
    soundedSpeedSeries = new TimeSeries();
    silenceSpeedSeries = new TimeSeries();
    volumeThresholdSeries = new TimeSeries();
    // Order determines z-index
    smoothie.addTimeSeries(soundedSpeedSeries, {
      lineWidth: 0,
      fillStyle: 'rgba(0, 255, 0, 0.3)',
    });
    smoothie.addTimeSeries(silenceSpeedSeries, {
      lineWidth: 0,
      fillStyle: 'rgba(255, 0, 0, 0.3)',
    });
    smoothie.addTimeSeries(volumeSeries, {
      // RGB taken from Audacity.
      lineWidth: 1,
      strokeStyle: 'rgba(100, 100, 220, 0)',
      fillStyle: 'rgba(100, 100, 220, 0.8)',
    });
    smoothie.addTimeSeries(volumeThresholdSeries, {
      lineWidth: 2,
      strokeStyle: '#f44',
      fillStyle: 'transparent',
    });
  }
  onMount(initSmoothie);
  // Making these weird wrappers so these reactive blocks are not run on each tick, because apparently putting these
  // statements directly inside them makes them behave like that.
  function updateSmoothieData() {
    const now = Date.now();
    const r = latestTelemetryRecord;
    // `+Infinity` doesn't appear to work, as well as `Number.MAX_SAFE_INTEGER`. Apparently because when the value is
    // too far beyond the chart bounds, the line is hidden.
    const hugeNumber = 9999;
    volumeSeries.append(now, r.inputVolume)
    soundedSpeedSeries.append(now, r.actualPlaybackRateName === 'soundedSpeed' ? hugeNumber : 0);
    silenceSpeedSeries.append(now, r.actualPlaybackRateName === 'silenceSpeed' ? hugeNumber : 0);
    
    if (process.env.NODE_ENV !== 'production') {
      if (r.inputVolume > hugeNumber) {
        console.warn('hugeNumber is supposed to be so large tha it\'s beyond chart bonds so it just looks like'
          + ' background, but now it has been exceeded by inutVolume value');
      }
    }
  }
  $: if (smoothie && latestTelemetryRecord) {
    latestTelemetryRecord;
    updateSmoothieData();
  }
  $: maxVolume = volumeThreshold * 6 || undefined;
  function updateSmoothieVolumeThreshold() {
    volumeThresholdSeries.clear();
    // Not sure if using larger values makes it consume more memory.
    volumeThresholdSeries.append(Date.now() - bufferDurationMillliseconds, volumeThreshold);
    const largeNumber = 1000 * 60 * 60 * 24;
    volumeThresholdSeries.append(Date.now() + largeNumber, volumeThreshold);

    smoothie.options.maxValue = maxVolume;
  }
  $: if (smoothie) {
    volumeThreshold, maxVolume;
    updateSmoothieVolumeThreshold()
  }
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
      max={maxVolume}
    />
    <span
      aria-hidden='true'
    >{lastVolume.toFixed(3)}</span>
  </label>
</canvas>
