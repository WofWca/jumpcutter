chrome.storage.sync.get(
  // TODO DRY with `popup.js`.
  {
    volumeThreshold: 0.012,
    silenceSpeed: 8,
    soundedSpeed: 1.75,
  },
  function (settings) {
    const currSettings = { ...settings };

    chrome.storage.onChanged.addListener(function (changes) {
      Object.entries(changes).forEach(([settingName, change]) => {
        currSettings[settingName] = change.newValue;
      })
    });

    async function controlSpeed(video) {
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule(chrome.runtime.getURL('VolumeGetterProcessor.js'));
      const volumeGetterNode = new AudioWorkletNode(ctx, 'VolumeGetterProcessor')
      // TODO audio lags for a moment because of this. Until we connect it to the destination.
      // Connecting volumeGetter first as the audio will stop playing as soon as we `createMediaElementSource`.
      volumeGetterNode.port.onmessage = (msg) => {
        maxChunkVolume = msg.data;
        // console.log(maxChunkVolume);
        if (maxChunkVolume < currSettings.volumeThreshold) {
          video.playbackRate = currSettings.silenceSpeed;
        } else {
          video.playbackRate = currSettings.soundedSpeed;
        }
      }
      volumeGetterNode.connect(ctx.destination);
      const src = ctx.createMediaElementSource(video);
      src.connect(volumeGetterNode);
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
