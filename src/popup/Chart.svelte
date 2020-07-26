<script>
  import { onMount } from 'svelte';
  import Chart from 'chart.js';
  // import throttle from 'lodash.throttle';

  export let history;
  // export let maxVolume;
  export let volumeThreshold;

  let canvasEl;

  // $: lastRecord = history[history.length - 1];
  $: volumes = history.map(({ volume }) => volume);
  $: lastVolume = volumes[volumes.length - 1] || 0;
  // TODO just get datasets and labels as separate arrays?
  $: labels = history.map(({ contextTime }) => contextTime);


  // let throttledUpdateChart = () => {};
  let chart = null;
  const chartVolumeDataset = {
    label: 'Volume',
    data: [],
    // data: volumes,
    steppedLine: true,
    // RGB taken from Audacity.
    borderColor: 'rgba(100, 100, 220, 0.8)',
    backgroundColor: 'rgba(100, 100, 220, 0.3)',
    borderWidth: 1,
    // borderColor: 'rgba(50, 50, 200, 1)',
    // backgroundColor: 'rgba(100, 100, 220, 1)',
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
        // labels: labels,
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
              // max: maxVolume, // TODO also make reactive?
              // suggestedMax: maxVolume, // TODO also make reactive?
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
    // setInterval(() => chart.update(), 3000);
    // throttledUpdateChart = throttle(() => chart.update(), 200);
  });
  
  let lastRAFFulfilled = true;
  function throttledUpdateChart() {
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
    // chartVolumeDataset.data = volumes;
    // chart.data.labels = labels;
    onDataUpdated(volumes, labels);
    throttledUpdateChart();
    // console.log('onDataUpdated run')
    // Don't call `update` if it has already been scheduled for the next frame.
    // Not sure if chart.js does this internally. TODO?
    // if (lastRAFFulfilled) {
    //   requestAnimationFrame(() => {
    //     chart.update();
    //     lastRAFFulfilled = true;
    //   });
    //   lastRAFFulfilled = false;
    // }
  
    // throttledUpdateChart();
    // chart.update(); // TODO also use requestAnimationFrame here?

    // const currRAFId = lastRAFId = requestAnimationFrame(() => {
    //   if (currRAFId !== lastRAFId) {
    //     console.log('update not run');
    //     return;
    //   }
    //   chart.update();
    // });

    // const currRAFId = lastRAFId = requestAnimationFrame(() => {
    //   if (currRAFId !== lastRAFId) {
    //     console.log('update not run');
    //     return;
    //   }
    //   chart.update();
    // });
  }
  $: maxVolume = volumeThreshold * 10 || undefined;
  function onVolumeUpdated(maxVolume, volumeThreshold) {
    if (!chart) return;
    chart.options.scales.yAxes[0].ticks.max = maxVolume;
    chartVolumeThresholdDataset.data = [volumeThreshold];
    throttledUpdateChart();
  }
  $: {
    // chart.options.scales.yAxes[0].ticks.max = maxVolume;
    // chartVolumeThresholdDataset.data = [volumeThreshold];
    onVolumeUpdated(maxVolume, volumeThreshold)
    // TODO this is run way too often.
    // console.log('onVolumeUpdated run')
  }

  // (async () => {
  //   await new Promise(r => setTimeout(r, 1000));
  //   debugger;
  // })();
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
