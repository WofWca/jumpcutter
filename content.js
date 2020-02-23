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
function getNewSnippetDuration(originalRealtimeDuration, originalSpeed, newSpeed) {
  const videoSpeedSnippetDuration = originalRealtimeDuration * originalSpeed;
  return videoSpeedSnippetDuration / newSpeed;
}
// The delay that the stretcher node is going to have when it's done slowing down a snippet
function getStretcherDelayChange(snippetOriginalRealtimeDuration, originalSpeed, newSpeed) {
  const snippetNewDuration = getNewSnippetDuration(snippetOriginalRealtimeDuration, originalSpeed, newSpeed);
  const delayChange = snippetNewDuration - snippetOriginalRealtimeDuration;
  return delayChange;
}
function getStretcherDelayChangeRate(originalSpeed, newSpeed) {
  // Could have used `getNewSnippetDuration` with some random snippet duration.
  // const videoSpeedSnippetDuration = originalRealtimeDuration * originalSpeed;
  // const newSnippetDuration = videoSpeedSnippetDuration / newSpeed;
  // const delayChange = newSnippetDuration - originalRealtimeDuration;
  // Delay change must happen over the new snippet duration.
  // const delayChangeRate = delayChange / newSnippetDuration = 
  //   (((originalRealtimeDuration * originalSpeed) / newSpeed) - originalRealtimeDuration)
  //   / ((originalRealtimeDuration * originalSpeed) / newSpeed);
  return 1 - newSpeed / originalSpeed;
}
function getStretcherSoundedDelay(videoTimeMarginBefore, soundedSpeed, silenceSpeed) {
  const realTimeMarginBefore = videoTimeMarginBefore / silenceSpeed;
  const delayChange = getStretcherDelayChange(realTimeMarginBefore, silenceSpeed, soundedSpeed);
  return 0 + delayChange;
}
function getWorkaroundAddedMargin(videoTimeMarginBefore, soundedSpeed, silenceSpeed) {
  return getStretcherSoundedDelay(videoTimeMarginBefore, soundedSpeed, silenceSpeed)
    / - getStretcherDelayChangeRate(soundedSpeed, silenceSpeed);
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

  // TODO we evaluate `stretcherNode.delayTime.value` now, but their values may not be the same at the time to which
  // we schedule the changes.
  // stretcherNode.delayTime.setValueAtTime(stretcherNode.delayTime.value, startTime);
  // stretcherNode.delayTime.linearRampToValueAtTime(stretcherNode.delayTime.value + delayChange, endTime);
  stretcherNode.delayTime.setValueAtTime(0, startTime);
  stretcherNode.delayTime.linearRampToValueAtTime(delayChange, endTime);
}
function scheduleStretcherNodeDelayReset(startIn, speedUpBy, stretcherNode, ctxCurrentTime) {
  const originalRealtimeSpeed = 1;
  const delayDecreaseSpeed = speedUpBy - originalRealtimeSpeed;
  const snippetNewDuration = stretcherNode.delayTime.value / delayDecreaseSpeed;
  const startTime = ctxCurrentTime + startIn;
  const endTime = startTime + snippetNewDuration;

  stretcherNode.delayTime
    .setValueAtTime(stretcherNode.delayTime.value, startTime)
    .linearRampToValueAtTime(0, endTime);

  // stretcherNode.delayTime.setValueAtTime(stretcherNode.delayTime.value, startTime);
  // stretcherNode.delayTime.cancelAndHoldAtTime(startTime).linearRampToValueAtTime(0, endTime);

  // stretcherNode.delayTime
  //   .setValueAtTime(getStretcherSoundedDelay(), startTime)
  //   .linearRampToValueAtTime(0, endTime);
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
      analyzerIn.fftSize = 4096;
      analyzerOut.fftSize = 4096;
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

          // The margin is greater than we need, because we want it to play at sounded speed a bit more, so we can
          // put the stretcher delay back to 0, but this would require speeding up the audio. We don't want to speed
          // up audio that is already at high speed.
          // silenceDetectorNode.parameters.get('durationThreshold').value =
          //   originalRealtimeMargin * currValues.silenceSpeed / currValues.soundedSpeed;

          const totalDelay = lookahead.delayTime.value + 0;
          // Can't just get `silenceDetectorNode.parameters.get('durationThreshold').value`, because the current value
          // may be different from the value at the moment to which we're scheduling the stretcher delay change.
          // Same for the `else` block.
          const oldRealtimeMargin = currValues.marginBefore / currValues.silenceSpeed;
          const startIn = totalDelay - oldRealtimeMargin;
          const originalEndIn = startIn + oldRealtimeMargin;
          const slowDownBy = currValues.silenceSpeed / currValues.soundedSpeed;
          scheduleAudioStretch(startIn, originalEndIn, slowDownBy, stretcher, ctx.currentTime);

          // The previous section is correct, but I commented it out to implement an easier version:
          silenceDetectorNode.parameters.get('durationThreshold').value =
            // Correct value
            currValues.marginBefore / newSpeed
            // This is so we don't have to deal with the case when we're starting to reset the stretcher delay, and then
            // there's a loud secton again and we have to pause the delay change halfway through.
            // This is the real-time duration of delay reset.
            + getWorkaroundAddedMargin(currValues.marginBefore, currValues.soundedSpeed, currValues.silenceSpeed);

          // console.log(`Ramping from ${stretcher.delayTime.value} to ${addedDelay} over ${slowDownDuration}s`);
          // log({ value: addedDelay, endDelta: endTime - ctx.currentTime });
        } else {
          // (Almost) same calculations as obove.
          const newSpeed = currValues.silenceSpeed;
          video.playbackRate = newSpeed;
          // ALong with speed, the margin changes, because it's real-time, not video-time.
          silenceDetectorNode.parameters.get('durationThreshold').value = currValues.marginBefore / newSpeed;

          const oldRealtimeMargin =
            currValues.marginBefore / currValues.soundedSpeed
            + getWorkaroundAddedMargin(currValues.marginBefore, currValues.soundedSpeed, currValues.silenceSpeed);
          const totalDelay = lookahead.delayTime.value
            + getStretcherSoundedDelay(currValues.marginBefore, currValues.soundedSpeed, currValues.silenceSpeed);
          const startIn = totalDelay - oldRealtimeMargin;

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
