'use strict';

// Assuming normal speech speed. Looked here https://en.wikipedia.org/wiki/Sampling_(signal_processing)#Sampling_rate
const MIN_HUMAN_SPEECH_ADEQUATE_SAMPLE_RATE = 8000;
const MAX_MARGIN_BEFORE_VIDEO_TIME = 0.5;
// Not just MIN_SOUNDED_SPEED, because in theory sounded speed could be greater than silence speed.
const MIN_SPEED = 0.25;
const MAX_MARGIN_BEFORE_REAL_TIME = MAX_MARGIN_BEFORE_VIDEO_TIME / MIN_SPEED;

const numberSettingsNames = ['silenceSpeed', 'soundedSpeed', 'marginBefore', 'marginAfter'];

function getRealtimeMargin(marginBefore, speed) {
  return marginBefore / speed;
}

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
// TODO Is it always constant though? What about these short silence snippets, where we don't have to fully reset the margin?
function getStretcherSoundedDelay(videoTimeMarginBefore, soundedSpeed, silenceSpeed) {
  const realTimeMarginBefore = videoTimeMarginBefore / silenceSpeed;
  const delayChange = getStretcherDelayChange(realTimeMarginBefore, silenceSpeed, soundedSpeed);
  return 0 + delayChange;
}

// // This function won't help us because on silenceStart we need to know the offset of the moment that has passed.
// // Wait. But isn't the stretcher's delay on silenceStart always at its max value?

// /**
//  * Answers the question "When is the sample that is currently on the input going to appear on the output?"
//  */
// function getCurrentMomentOutputDelay(lookaheadDelay, lastScheduledStretcherDelayReset) {
//   return lookaheadDelay + 
// }



// /**
//  * The holy grail of this algorithm.
//  * Answers the question "When is the sample that has been on the input `ago` seconds ago going to appear on the output?"
//  * Only works for input values such that the correct answer is after the `lastScheduledStretcherDelayReset`'s start time.
//  * @param {number} ago - how long ago the target moment has appeared on the input, in seconds.
//  */
// function getMomentOutputTime(ago, lookaheadDelay, lastScheduledStretcherDelayReset) {
//   return lookaheadDelay + 
// }

/**
 * The holy grail of this algorithm.
 * Answers the question "When is the sample that has been on the input at `momentTime` going to appear on the output?"
 * Contract:
 * * Only works for input values such that the correct answer is after the `lastScheduledStretcherDelayReset`'s start time.
 * * Assumes the video is never played backwards (i.e. stretcher delay never so quickly).
 */
function getMomentOutputTime(momentTime, lookaheadDelay, lastScheduledStretcherDelayReset) {
  const stretch = lastScheduledStretcherDelayReset;
  const stretchEndTotalDelay = getTotalDelay(lookaheadDelay, stretch.endValue);
  // TODO `const asdadsd = momentTime + stretchEndTotalDelay;` ?
  // Simpliest case. The target moment is after the `stretch`'s end time
  if (momentTime + stretchEndTotalDelay >= stretch.endTime) {
    return momentTime + stretchEndTotalDelay;
  } else {
    // `lastScheduledStretcherDelayReset` is going to be in progress when the target moment is on the output.
    // At which point between its tart and end would the target moment be played?
    const originalTargetMomentOffsetRelativeToStretchStart =
      momentTime + getTotalDelay(lookaheadDelay, stretch.startValue) - stretch.startTime;
    // By how much the snippet is going to be stretched?
    const playbackSpeedupDuringStretch =
      ((stretch.endTime - stretch.startTime) + (stretch.startValue - stretch.endValue))
      / (stretch.endTime - stretch.startTime);
    // const stretchedSnippetFinalDurationRelativeToOriginalDuration =
    //   ((stretch.endTime - stretch.startTime) + (stretch.endValue - stretch.startValue))
    //   / (stretch.endTime - stretch.startTime);
    // const stretchedSnippetFinalDurationRelativeToOriginalDuration =
    //   (stretch.endTime - stretch.startTime)
    //   / ((stretch.endTime - stretch.startTime) + (stretch.startValue - stretch.endValue));
    // How much time will pass since the stretch start until the target moment is played on the output?
    const finalTargetMomentOffsetRelativeToStretchStart =
      originalTargetMomentOffsetRelativeToStretchStart / playbackSpeedupDuringStretch;
    
    // Wait what? Stretch start time? Don't we know it already?
    // const stretchStartTime = momentTime + getTotalDelay(lookaheadDelay, stretch.startValue);
    // return stretchStartTime + finalTargetMomentOffsetRelativeToStretchStart;

    return stretch.startTime + finalTargetMomentOffsetRelativeToStretchStart;
  }
}
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
      let lastScheduledStretcherDelayReset = null;

      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule(chrome.runtime.getURL('SilenceDetectorProcessor.js'));

      const maxSpeedToPreserveSpeech = ctx.sampleRate / MIN_HUMAN_SPEECH_ADEQUATE_SAMPLE_RATE;
      const maxMaginStretcherDelay = MAX_MARGIN_BEFORE_REAL_TIME * (maxSpeedToPreserveSpeech / MIN_SPEED);

      const silenceDetectorNode = new AudioWorkletNode(ctx, 'SilenceDetectorProcessor', {
        parameterData: {
          volumeThreshold: settings.volumeThreshold,
          durationThreshold: getRealtimeMargin(currValues.marginBefore, currValues.soundedSpeed),
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
        const currentTime = ctx.currentTime;
        const silenceStartOrEnd = msg.data;
        // console.log(silenceStartOrEnd);
        if (silenceStartOrEnd === 'silenceEnd') {
          video.playbackRate = currValues.soundedSpeed;

          // TODO all this does look like it may cause a snowballing floating point error. Mathematically simplify this?
          // Or just use if-else?

          const lastSilenceSpeedLastsForRealtime = currentTime - lastScheduledStretcherDelayReset.newSpeedStartInputTime;
          const lastSilenceSpeedLastsForVideoTime = lastSilenceSpeedLastsForRealtime * currValues.silenceSpeed;

          const marginBeforePartAtSilenceSpeedVideoTimeDuration = Math.min(
            lastSilenceSpeedLastsForVideoTime,
            currValues.marginBefore,
          );
          const marginBeforePartAlreadyAtSoundedSpeedVideoTimeDuration =
            currValues.marginBefore - marginBeforePartAtSilenceSpeedVideoTimeDuration;
          const marginBeforePartAtSilenceSpeedRealTimeDuration =
            marginBeforePartAtSilenceSpeedVideoTimeDuration / currValues.silenceSpeed;
          const marginBeforePartAlreadyAtSoundedSpeedRealTimeDuration =
            marginBeforePartAlreadyAtSoundedSpeedVideoTimeDuration / currValues.soundedSpeed;
          // The time at which the moment from which the speed of the video needs to be slow has been on the input.
          const marginBeforeStartInputTime =
            currentTime
            - marginBeforePartAtSilenceSpeedRealTimeDuration
            - marginBeforePartAlreadyAtSoundedSpeedRealTimeDuration;
          // Same, but when it's going to be on the output.
          const marginBeforeStartOutputTime = getMomentOutputTime(
            marginBeforeStartInputTime,
            lookahead.delayTime.value,
            lastScheduledStretcherDelayReset,
          );
          const marginBeforeStartOutputTimeTotalDelay = marginBeforeStartOutputTime - marginBeforeStartInputTime;
          const marginBeforeStartOutputTimeStretcherDelay =
            marginBeforeStartOutputTimeTotalDelay - lookahead.delayTime.value;

          // As you remember, silence on the input must last for some time before we speed up the video.
          // We then speed up these sections by calling `scheduleStretcherNodeDelayReset`.
          // And sometimes we may stumble upon a silence period long enough to make us speed up the video, but short
          // enough for us to not be done with speeding up that last part, so the margin before and that last part
          // overlap, and we end up in a situation where we only need to stretch the last part of the margin before
          // snippet, because the first one is already at required (sounded) speed, due to that delay before we speed up
          // the video after some silence.
          // This is also the reason why `getMomentOutputTime` function is so long.
          // Let's find this breakpoint.

          if (marginBeforeStartOutputTime < lastScheduledStretcherDelayReset.endTime) {
            // Cancel the complete delay reset, and instead stop decreasing it at `marginBeforeStartOutputTime`.
            stretcher.delayTime
              .cancelAndHoldAtTime(marginBeforeStartOutputTime)
              .linearRampToValueAtTime(marginBeforeStartOutputTimeStretcherDelay, marginBeforeStartOutputTime);
              // Maybe it's more clear to write this as:
              // .cancelAndHoldAtTime(lastScheduledStretcherDelayReset.startTime)
              // .linearRampToValueAtTime(marginBeforeStartOutputTimeStretcherDelay, marginBeforeStartOutputTime)
            log({
              type: 'pauseReset',
              value: marginBeforeStartOutputTimeStretcherDelay,
              time: marginBeforeStartOutputTime,
            });
          }

          const alreadySoundedSpeedPartEndOutputTime =
            // A.k.a. `marginBeforeStartOutputTime + marginBeforePartAlreadyAtSoundedSpeedRealTimeDuration`
            lastScheduledStretcherDelayReset.newSpeedStartInputTime
            + getTotalDelay(lookahead.delayTime.value, marginBeforeStartOutputTimeStretcherDelay);
          // Need to `setValueAtTime` to the same value again so further `linearRampToValueAtTime` makes increasing the
          // delay from `alreadySoundedSpeedPartEndOutputTime`.
          stretcher.delayTime.setValueAtTime(
            marginBeforeStartOutputTimeStretcherDelay,
            alreadySoundedSpeedPartEndOutputTime
          );
          log({
            type: 'setValueAtTime',
            value: marginBeforeStartOutputTimeStretcherDelay,
            time: alreadySoundedSpeedPartEndOutputTime,
          });
          const silenceSpeedPartStretchedDuration = getNewSnippetDuration(
            marginBeforePartAtSilenceSpeedRealTimeDuration,
            currValues.silenceSpeed,
            currValues.soundedSpeed
          );
          const stretcherDelayIncrease = getStretcherDelayChange(
            marginBeforePartAtSilenceSpeedRealTimeDuration,
            currValues.silenceSpeed,
            currValues.soundedSpeed
          );
          // I think currently it should always be equal to the max delay.
          const finalStretcherDelay = marginBeforeStartOutputTimeStretcherDelay + stretcherDelayIncrease;
          stretcher.delayTime.linearRampToValueAtTime(
            // A.k.a. `marginBeforeStartOutputTimeStretcherDelay + stretcherDelayIncrease`,
            finalStretcherDelay,
            // A.k.a. `alreadySoundedSpeedPartEndOutputTime + silenceSpeedPartStretchedDuration`
            currentTime + getTotalDelay(lookahead.delayTime.value, finalStretcherDelay)
          );
          log({
            type: 'linearRampToValueAtTime',
            value: marginBeforeStartOutputTimeStretcherDelay + stretcherDelayIncrease,
            time: alreadySoundedSpeedPartEndOutputTime + silenceSpeedPartStretchedDuration,
          });
        } else {
          // (Almost) same calculations as obove.
          video.playbackRate = currValues.silenceSpeed;

          const oldRealtimeMargin = getRealtimeMargin(currValues.marginBefore, currValues.soundedSpeed);
          // When the time comes to increase the video speed, the stretcher's delay is always at its max value.
          const stretcherDelayStartValue =
            getStretcherSoundedDelay(currValues.marginBefore, currValues.soundedSpeed, currValues.silenceSpeed);
          const startIn = getTotalDelay(lookahead.delayTime.value, stretcherDelayStartValue) - oldRealtimeMargin;

          const speedUpBy = currValues.silenceSpeed / currValues.soundedSpeed;
          // scheduleStretcherNodeDelayReset(startIn, speedUpBy, stretcher, ctx.currentTime);

          const originalRealtimeSpeed = 1;
          const delayDecreaseSpeed = speedUpBy - originalRealtimeSpeed;
          const snippetNewDuration = stretcherDelayStartValue / delayDecreaseSpeed;
          const startTime = currentTime + startIn;
          const endTime = startTime + snippetNewDuration;
          stretcher.delayTime
            .setValueAtTime(stretcherDelayStartValue, startTime)
            .linearRampToValueAtTime(0, endTime);
          lastScheduledStretcherDelayReset = {
            newSpeedStartInputTime: currentTime,
            startTime,
            startValue: stretcherDelayStartValue,
            endTime,
            endValue: 0,
          };

          log({
            type: 'reset',
            startValue: stretcherDelayStartValue,
            startTime: startTime,
            endTime: endTime,
            lastScheduledStretcherDelayReset,
          });
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
