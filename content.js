const SILENCE_SPEED = 4;
const SOUNDED_SPEED = 1;
const VOLUME_THRESHOLD = 30;
const SOUNDED_MARGIN_AFTER = 300;
// Make sure for now that this is less than SOUNDED_MARGIN_AFTER, so we don't enter an infinite loop. Until we fix
// the algorithm.
const SOUNDED_MARGIN_BEFORE = 100;
const SMOOTHING_TIME_CONSTANT = 0;

const SOUNDED_MARGIN_BEFORE_SEC = SOUNDED_MARGIN_BEFORE / 1000;
window.onload = () => {
  const video = document.querySelector('video');
  console.log('Jump Cutter: video:', video);
  if (video === null) {
    // TODO search again when document updates? Or just after some time?
    console.log('Jump cutter: no video found. Exiting');
    return;
  }
  const ctx = new AudioContext();
  const analyzer = ctx.createAnalyser();
  // TODO audio lags because of this on load. until we connect it to the destination.
  // Connecting analyzer first as the audio will stop playing as soon as we createMediaElementSource.
  analyzer.connect(ctx.destination);
  const src = ctx.createMediaElementSource(video);
  src.connect(analyzer);

  analyzer.fftSize = 64;
  analyzer.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
  const bufferLength = analyzer.frequencyBinCount;
  const frequencyData = new Uint8Array(bufferLength);

  let speedupTimeout = -1;
  function controlSpeed() {
    analyzer.getByteFrequencyData(frequencyData);
    const sum = frequencyData.reduce((sum, amplitude) => (sum + amplitude), 0);
    const vol = sum / frequencyData.length;
    if (vol < VOLUME_THRESHOLD) {
      if (speedupTimeout === -1) {
        speedupTimeout = setTimeout(() => { video.playbackRate = SILENCE_SPEED; }, SOUNDED_MARGIN_AFTER);
      }
    } else {
      if (video.playbackRate === SILENCE_SPEED) {
        video.currentTime = video.currentTime - SOUNDED_MARGIN_BEFORE_SEC;
      }

      video.playbackRate = SOUNDED_SPEED;
      clearTimeout(speedupTimeout);
      speedupTimeout = -1;
    }
    setTimeout(controlSpeed, 5)
  }
  controlSpeed();
}
