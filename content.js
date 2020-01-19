chrome.storage.sync.get(
  // TODO DRY with `popup.js`.
  {
    volumeThreshold: 0.010,
    silenceSpeed: 4,
    soundedSpeed: 1.75,
  },
  function (settings) {
    let currSilenceSpeed = settings.silenceSpeed;
    let currSoundedSpeed = settings.soundedSpeed;

    async function controlSpeed(video) {
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule(chrome.runtime.getURL('ThresholdDetectorProcessor.js'));
      const thresholdDetectorNode = new AudioWorkletNode(ctx, 'ThresholdDetectorProcessor', {
        parameterData: { volumeThreshold: settings.volumeThreshold },
      })
      // TODO audio lags for a moment because of this. Until we connect it to the destination.
      // Connecting volumeGetter first as the audio will stop playing as soon as we `createMediaElementSource`.
      thresholdDetectorNode.port.onmessage = (msg) => {
        const goneAboveOrBelow = msg.data;
        // console.log(goneAboveOrBelow);
        if (goneAboveOrBelow === 'below') {
          video.playbackRate = currSilenceSpeed;
        } else {
          video.playbackRate = currSoundedSpeed;
        }
      }
      thresholdDetectorNode.connect(ctx.destination);
      const src = ctx.createMediaElementSource(video);
      src.connect(thresholdDetectorNode);

      chrome.storage.onChanged.addListener(function (changes) {
        const silenceSpeedChange = changes.silenceSpeed;
        if (silenceSpeedChange !== undefined) {
          currSilenceSpeed = silenceSpeedChange.newValue;
        }
        const soundedSpeedChange = changes.soundedSpeed;
        if (soundedSpeedChange !== undefined) {
          currSoundedSpeed = soundedSpeedChange.newValue;
        }
        const volumeThresholdChange = changes.volumeThreshold;
        if (volumeThresholdChange !== undefined) {
          const volumeThresholdParam = thresholdDetectorNode.parameters.get('volumeThreshold');
          volumeThresholdParam.setValueAtTime(volumeThresholdChange.newValue, ctx.currentTime);
        }
      });
    }

    const video = document.querySelector('video');
    // console.log('Jump Cutter: video:', video);
    if (video === null) {
      // TODO search again when document updates? Or just after some time?
      console.log('Jump cutter: no video found. Exiting');
    }
    controlSpeed(video);
  }
);
