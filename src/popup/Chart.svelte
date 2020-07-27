<script>
  import { onMount } from 'svelte';
  // import { IHorizontalLine } from 'smoothie'; // Uncommenting this makes it bundle it into this file

  export let latestTelemetryRecord;
  export let volumeThreshold;

  let canvasEl;

  $: lastVolume = latestTelemetryRecord && latestTelemetryRecord.volume || 0;

  let smoothie;
  let volumeSeries;
  /**
   * @type {IHorizontalLine}
   */
  const volumeHorizontalLine = {
    color: '#f44',
  };
  async function initSmoothie() {
    const { SmoothieChart, TimeSeries } = await import(
      /* webpackPreload: true */
      /* webpackExports: ['SmoothieChart', 'TimeSeries'] */
      'smoothie'
    );
    // TODO make all these numbers customizable.
    smoothie = new SmoothieChart({
      millisPerPixel: 20,
      interpolation: 'linear',
      // responsive: true, ?
      grid: {
        fillStyle: '#fff',
        strokeStyle: '#eaeaea',
        verticalSections: 0,
        millisPerLine: 1000,
        sharpLines: true,
      },
      horizontalLines: [volumeHorizontalLine],
      labels: {
        disabled: true,
      },
      minValue: 0,
      scaleSmoothing: 1,
    });
    smoothie.streamTo(canvasEl, );
    volumeSeries = new TimeSeries();
    smoothie.addTimeSeries(volumeSeries, {
      // RGB taken from Audacity.
      lineWidth: 1,
      strokeStyle: 'rgba(100, 100, 220, 0.7)',
      fillStyle: 'rgba(100, 100, 220, 0.2)',
    });
  }
  onMount(initSmoothie);
  // Making these weird wrappers so these reactive blocks are not run on each tick, because apparently putting these
  // statements directly inside them makes them behave like that.
  function updateSmoothieData() {
    volumeSeries.append(Date.now(), latestTelemetryRecord.volume)
  }
  $: if (smoothie && latestTelemetryRecord) {
    latestTelemetryRecord;
    updateSmoothieData();
  }
  $: maxVolume = volumeThreshold * 6 || undefined;
  function updateSmoothieVolumeThreshold() {
    volumeHorizontalLine.value = volumeThreshold;
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
