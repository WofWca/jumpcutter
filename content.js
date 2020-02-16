'use strict';

// Assuming normal speech speed. Looked here https://en.wikipedia.org/wiki/Sampling_(signal_processing)#Sampling_rate
const MIN_HUMAN_SPEECH_ADEQUATE_SAMPLE_RATE = 8000;
const MAX_MARGIN_BEFORE_VIDEO_TIME = 0.5;
// Not just MIN_SOUNDED_SPEED, because in theory sounded speed could be greater than silence speed.
const MIN_SPEED = 0.25;
const MAX_MARGIN_BEFORE_REAL_TIME = MAX_MARGIN_BEFORE_VIDEO_TIME / MIN_SPEED;

const numberSettingsNames = ['silenceSpeed', 'soundedSpeed', 'marginBefore', 'marginAfter'];

function getNewLookaheadDelay(videoTimeMargin, soundedSpeed, silenceSpeed) {
  return videoTimeMargin / Math.min(soundedSpeed, silenceSpeed)
}
function getTotalDelay(lookaheadNodeDelay, stretcherNodeDelay) {
  return lookaheadNodeDelay + stretcherNodeDelay;
}
// function setVideoSpeed(video, newSpeed, silenceDetectorNode, videoTimeMarginBefore) {
//   video.playbackRate = newSpeed;
//   // ALong with speed, the margin changes, because it's real-time, not video-time.
//   silenceDetectorNode.parameters.get('durationThreshold').value = videoTimeMarginBefore / newSpeed;
// }
/**
 * Gradually increases/decreases delay of stretcherNode. Not pitch-corrected.
 * @param {number} startIn How many seconds from now it will start playing.
 * @param {number} originalEndIn How many seconds from now it would stop playing if we wouldn't stretch it.
 * @param {number} by By how much to stretch it.
 * @param {DelayNode} stretcherNode The node which is going to be performing this manipulation.
 */
function scheduleAudioStretch(startIn, originalEndIn, by, stretcherNode, ctxCurrentTime) {
  const snippetOriginalDuration = originalEndIn - startIn;
  const snippetNewDuration = by * snippetOriginalDuration;
  const delayChange = snippetNewDuration - snippetOriginalDuration;
  const startTime = ctxCurrentTime + startIn;
  const endTime = startTime + snippetNewDuration;
  stretcherNode.delayTime.setValueAtTime(stretcherNode.delayTime.value, startTime);
  stretcherNode.delayTime.linearRampToValueAtTime(stretcherNode.delayTime.value + delayChange, endTime);
}
function scheduleStretcherNodeDelayReset(startIn, speedUpBy, stretcherNode, ctxCurrentTime) {
  const originalRealtimeSpeed = 1;
  const delayDecreaseSpeed = speedUpBy - originalRealtimeSpeed;
  const snippetNewDuration = stretcherNode.delayTime.value / delayDecreaseSpeed;
  const startTime = ctxCurrentTime + startIn;
  const endTime = startTime + snippetNewDuration;
  stretcherNode.delayTime.setValueAtTime(stretcherNode.delayTime.value, startTime);
  stretcherNode.delayTime.linearRampToValueAtTime(0, endTime);
}

chrome.storage.sync.get(
  // TODO DRY with `popup.js`.
  {
    volumeThreshold: 0.010,
    silenceSpeed: 4,
    soundedSpeed: 1.75,
    enabled: true,
    marginBefore: 0.100,
    marginAfter: 0.100,
  },
  function (settings) {
    if (!settings.enabled) {
      return;
    }

    const currValues = {};
    numberSettingsNames.forEach(n => currValues[n] = settings[n]);

    async function controlSpeed(video) {
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule(chrome.runtime.getURL('SilenceDetectorProcessor.js'));

      const maxSpeedToPreserveSpeech = ctx.sampleRate / MIN_HUMAN_SPEECH_ADEQUATE_SAMPLE_RATE;
      const maxMaginStretcherDelay = MAX_MARGIN_BEFORE_REAL_TIME * (maxSpeedToPreserveSpeech / MIN_SPEED);

      const silenceDetectorNode = new AudioWorkletNode(ctx, 'SilenceDetectorProcessor', {
        parameterData: {
          volumeThreshold: settings.volumeThreshold,
          durationThreshold: currValues.marginBefore + currValues.marginAfter,
          sampleRate: ctx.sampleRate,
        },
        processorOptions: { initialDuration: Infinity },
        numberOfOutputs: 0,
      });
      const analyzerIn = ctx.createAnalyser();
      const analyzerOut = ctx.createAnalyser();
      analyzerIn.fftSize = 64;
      analyzerOut.fftSize = 64;
      const lookahead = ctx.createDelay(MAX_MARGIN_BEFORE_REAL_TIME);
      const stretcher = ctx.createDelay(maxMaginStretcherDelay);
      const src = ctx.createMediaElementSource(video);
      src.connect(lookahead);
      src.connect(silenceDetectorNode);
      src.connect(analyzerIn);
      lookahead.connect(stretcher);
      stretcher.connect(ctx.destination);
      stretcher.connect(analyzerOut);
      
      lookahead.delayTime.value = getNewLookaheadDelay(currValues.marginBefore, currValues.soundedSpeed, currValues.silenceSpeed);
      stretcher.delayTime.value = 0;
      // If we don't do this explicitly, it would jump when we call `.linearRampToValueAtTime`.
      // Looks like a bug, Chromium: 79.0.3945.130 (Official Build) (64-bit)
      stretcher.delayTime.setValueAtTime(0, ctx.currentTime);

      const logArr = [];
      const logBuffer = new Float32Array(analyzerOut.fftSize);
      console.log(logArr)
      function log(msg = null) {
        analyzerOut.getFloatTimeDomainData(logBuffer);
        const outVol = logBuffer.reduce((acc, curr) => acc + Math.abs(curr), 0) / analyzerOut.fftSize;
        analyzerIn.getFloatTimeDomainData(logBuffer);
        const inVol = logBuffer.reduce((acc, curr) => acc + Math.abs(curr), 0) / analyzerIn.fftSize;
        logArr.push({
          msg,
          t: ctx.currentTime,
          delay: stretcher.delayTime.value,
          speed: video.playbackRate,
          inVol,
          outVol,
        });
      }

      silenceDetectorNode.port.onmessage = (msg) => {
        const silenceStartOrEnd = msg.data;
        // console.log(silenceStartOrEnd);
        if (silenceStartOrEnd === 'silenceEnd') {
          const newSpeed = currValues.soundedSpeed;
          video.playbackRate = newSpeed;
          // ALong with speed, the margin changes, because it's real-time, not video-time.
          const originalRealtimeMargin = silenceDetectorNode.parameters.get('durationThreshold').value;
          // The margin is greater than we need, because we want it to play at sounded speed a bit more, so we can
          // put the stretcher delay back to 0, but this would require speeding up the audio. We don't want to speed
          // up audio that is already at high speed.
          silenceDetectorNode.parameters.get('durationThreshold').value =
            originalRealtimeMargin * currValues.silenceSpeed / currValues.soundedSpeed;

          const totalDelay = getTotalDelay(lookahead.delayTime.value, stretcher.delayTime.value);
          const startIn = totalDelay - originalRealtimeMargin;
          const originalEndIn = startIn + originalRealtimeMargin;
          const slowDownBy = currValues.silenceSpeed / currValues.soundedSpeed;
          scheduleAudioStretch(startIn, originalEndIn, slowDownBy, stretcher, ctx.currentTime);

          // console.log(`Ramping from ${stretcher.delayTime.value} to ${addedDelay} over ${slowDownDuration}s`);
          // log({ value: addedDelay, endDelta: endTime - ctx.currentTime });
        } else {
          // (Almost) same calculations as obove.
          const newSpeed = currValues.silenceSpeed;
          video.playbackRate = newSpeed;
          // ALong with speed, the margin changes, because it's real-time, not video-time.
          const originalRealtimeMargin = silenceDetectorNode.parameters.get('durationThreshold').value;
          silenceDetectorNode.parameters.get('durationThreshold').value = currValues.marginBefore / newSpeed;

          const totalDelay = getTotalDelay(lookahead.delayTime.value, stretcher.delayTime.value);
          const startIn = totalDelay - originalRealtimeMargin;
          const speedUpBy = currValues.silenceSpeed / currValues.soundedSpeed;
          scheduleStretcherNodeDelayReset(startIn, speedUpBy, stretcher, ctx.currentTime);

          // log({ value: 0, endDelta: endTime - ctx.currentTime }); // We don't show the delay here actually
          // console.log(`Ramping from ${stretcher.delayTime.value} to ${0} over ${speeUpDuration}s`);
        }
      }
      // setInterval(() => console.log(stretcher.delayTime.value), 10);
      setInterval(() => {
        log();
      }, 1);

      chrome.storage.onChanged.addListener(function (changes) {
        numberSettingsNames.forEach(n => {
          const change = changes[n];
          if (change !== undefined) {
            currValues[n] = change.newValue;
          }
        });

        const marginBeforeChange = changes.marginBefore;
        if (marginBeforeChange !== undefined) {
          // TODO gradual change?
          lookahead.delayTime.value = getNewLookaheadDelay(currValues.marginBefore, currValues.soundedSpeed, currValues.silenceSpeed);
        }

        const marginAfterChange = changes.marginAfter;
        // if (marginAfterChange !== undefined) {}

        if (marginBeforeChange !== undefined || marginAfterChange !== undefined) {
          const durationThresholdParam = silenceDetectorNode.parameters.get('durationThreshold');
          // TODO DRY with constructor.
          durationThresholdParam.value = currValues.marginBefore + currValues.marginAfter;
        }

        const volumeThresholdChange = changes.volumeThreshold;
        if (volumeThresholdChange !== undefined) {
          const volumeThresholdParam = silenceDetectorNode.parameters.get('volumeThreshold');
          volumeThresholdParam.setValueAtTime(volumeThresholdChange.newValue, ctx.currentTime);
        }
      });
    }

    const video = document.querySelector('video');
    // console.log('Jump Cutter: video:', video);
    if (video === null) {
      // TODO search again when document updates? Or just after some time?
      console.log('Jump cutter: no video found. Exiting');
      return;
    }
    controlSpeed(video);
  }
);
