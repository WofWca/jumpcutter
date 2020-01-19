const SILENCE_SPEED = 4;
const SOUNDED_SPEED = 1;
const VOLUME_THRESHOLD = 0.01;
// const SOUNDED_MARGIN_AFTER = 0;
// const SOUNDED_MARGIN_BEFORE = 40;
// const SOUNDED_MARGIN_BEFORE_SEC = SOUNDED_MARGIN_BEFORE / 1000;

async function controlSpeed(video) {
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(chrome.runtime.getURL('VolumeGetterProcessor.js'));
  const volumeGetterNode = new AudioWorkletNode(ctx, 'VolumeGetterProcessor')
  // TODO audio lags for a moment because of this. Until we connect it to the destination.
  // Connecting volumeGetter first as the audio will stop playing as soon as we `createMediaElementSource`.
  volumeGetterNode.port.onmessage = (msg) => {
    maxChunkVolume = msg.data;
    // console.log(maxChunkVolume);
    if (maxChunkVolume < VOLUME_THRESHOLD) {
      video.playbackRate = SILENCE_SPEED;
    } else {
      video.playbackRate = SOUNDED_SPEED;
    }
  }
  volumeGetterNode.connect(ctx.destination);
  const src = ctx.createMediaElementSource(video);
  src.connect(volumeGetterNode);
}

const video = document.querySelector('video');
console.log('Jump Cutter: video:', video);
if (video !== null) {
  controlSpeed(video);
} else {
  // TODO search again when document updates? Or just after some time?
  console.log('Jump cutter: no video found. Exiting');
}
