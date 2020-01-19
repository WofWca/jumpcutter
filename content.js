const SILENCE_SPEED = 4;
const SOUNDED_SPEED = 1;
const VOLUME_THRESHOLD = 0.01;
const SOUNDED_MARGIN_AFTER = 0;
const SOUNDED_MARGIN_BEFORE = 40;

const SOUNDED_MARGIN_BEFORE_SEC = SOUNDED_MARGIN_BEFORE / 1000;
const video = document.querySelector('video');
console.log('Jump Cutter: video:', video);
if (video !== null) {
  const ctx = new AudioContext();
  // TODO ScriptProcessor is deprecated. How to use `AudioWorkletProcessor`? It requries a separate file.
  const scriptProcessor = ctx.createScriptProcessor(0, 1, 1);
  // TODO audio lags because of this on load. until we connect it to the destination.
  // Connecting scriptProcessor first as the audio will stop playing as soon as we createMediaElementSource.
  scriptProcessor.connect(ctx.destination);
  const src = ctx.createMediaElementSource(video);
  src.connect(scriptProcessor);

  let maxChunkVolume;
  scriptProcessor.onaudioprocess = function (e) {
    const numChannels = e.inputBuffer.numberOfChannels;
    maxChunkVolume = 0;
    for (let channelI = 0; channelI < numChannels; channelI++) {
      const inputChannelData = e.inputBuffer.getChannelData(channelI);
      e.outputBuffer.copyToChannel(inputChannelData, channelI);
      const numSamples = inputChannelData.length;
      // `forEach` and `reduce` appear to be slower here.
      for (let sampleI = 0; sampleI < numSamples; sampleI++) {
        const currVol = Math.abs(inputChannelData[sampleI]);
        if (currVol > maxChunkVolume) {
          maxChunkVolume = currVol;
        }
      }
    }
    requestAnimationFrame(() => console.log(maxChunkVolume.toFixed(8)));
    if (maxChunkVolume < VOLUME_THRESHOLD) {
      video.playbackRate = SILENCE_SPEED;
    } else {
      video.playbackRate = SOUNDED_SPEED;
    }
  }
} else {
  // TODO search again when document updates? Or just after some time?
  console.log('Jump cutter: no video found. Exiting');
}
