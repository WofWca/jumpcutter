<script>
  import { onMount } from 'svelte';
  import Chart from 'chart.js';

  export let history;
  export let volumeThreshold;

  let canvasEl;

  $: volumes = history.map(({ volume }) => volume);
  $: lastVolume = volumes[volumes.length - 1] || 0;
  // TODO just get datasets and labels as separate arrays?
  $: labels = history.map(({ contextTime }) => contextTime);


  let chart = null;
  const chartVolumeDataset = {
    label: 'Volume',
    data: [],
    steppedLine: true,
    // RGB taken from Audacity.
    borderColor: 'rgba(100, 100, 220, 0.8)',
    backgroundColor: 'rgba(100, 100, 220, 0.3)',
    borderWidth: 1,
    pointRadius: 0,
  };
  const chartVolumeThresholdDataset = {
    label: 'Volume Threshold',
    data: [],
    fill: false,
  };
  onMount(() => {
    const ctx = canvasEl.getContext('2d');

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [chartVolumeDataset, chartVolumeThresholdDataset],
      },
      options: {
        scales: {
          xAxes: [{
            display: false,
            // type: 'time',
          }],
          yAxes: [{
            ticks: {
              min: 0,
            },
            gridLines: {
              display: false,
            }
          }],
        },

        // TODO: `responsive: false`, and set fixed width for performance?
        animation: {
          duration: 0,
        },
        hover: {
          animationDuration: 0,
        },
        responsiveAnimationDuration: 0
      },
    });
  });
  
  let lastRAFFulfilled = true;
  function throttledUpdateChart() {
    // Don't call `update` if it has already been scheduled for the next frame.
    // Not sure if chart.js does this internally. TODO?
    if (lastRAFFulfilled) {
      requestAnimationFrame(() => {
        chart.update();
        lastRAFFulfilled = true;
      });
      lastRAFFulfilled = false;
    }
  }
  // Making these weird wrappers to not run these reactive blocks on each tick, because apparently putting these
  // statements directly inside them makes them behave like that.
  function onDataUpdated(volumes, labels) {
    if (!chart) return;
    chartVolumeDataset.data = volumes;
    chart.data.labels = labels;
  }
  $: {
    onDataUpdated(volumes, labels);
    throttledUpdateChart();
  }
  $: maxVolume = volumeThreshold * 10 || undefined;
  function onVolumeUpdated(maxVolume, volumeThreshold) {
    if (!chart) return;
    chart.options.scales.yAxes[0].ticks.max = maxVolume;
    chartVolumeThresholdDataset.data = [volumeThreshold];
    throttledUpdateChart();
  }
  $: {
    onVolumeUpdated(maxVolume, volumeThreshold);
  }
</script>

<canvas bind:this={canvasEl}>
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
