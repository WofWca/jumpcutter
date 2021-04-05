// Importing this way because the Tone.js library has a lot of modules with side-effects and they get bundled.
// TODO can we import `.ts` files instead of the built ones?
import { setContext as toneSetContext, getContext as toneGetContext } from 'tone/build/esm/core/Global';
import { connect as ToneConnect } from 'tone/build/esm/core/context/ToneAudioNode';
import { PitchShift } from 'tone/build/esm/effect/PitchShift';
import { ToneAudioNode } from 'tone/build/esm/core/context/ToneAudioNode';
import {
  getMomentOutputTime,
  getTotalDelay,
  getStretchSpeedChangeMultiplier,
  getStretcherDelayChange,
  getRealtimeMargin,
  getStretcherSoundedDelay,
} from './helpers';
import type { Time, StretchInfo } from '@/helpers';
import { assert } from '@/helpers';


// TODO make it into a setting?
const CROSS_FADE_DURATION = 0.01;

type PitchSetting = 'slowdown' | 'speedup' | 'normal';

export default class PitchPreservingStretcherNode {
  // 2 pitch shifts and 3 gains because `.pitch` of `PitchShift` is not an AudioParam, therefore doesn't support
  // scheduling.
  speedUpGain: GainNode;
  slowDownGain: GainNode;
  normalSpeedGain: GainNode;
  toneContext: ReturnType<typeof toneGetContext>
  speedUpPitchShift: PitchShift;
  slowDownPitchShift: PitchShift;
  originalPitchCompensationDelay: DelayNode;
  delayNode: DelayNode;
  lastScheduledStretch?: StretchInfo & { speedupOrSlowdown: 'speedup' | 'slowdown' };
  lastElementSpeedChangeAtInputTime?: Time;

  constructor(
    private context: AudioContext,
    maxDelay: Time,
    initialDelay: Time = 0,
    private getSettings: () => ({
      soundedSpeed: number,
      silenceSpeed: number,
      marginBefore: number,
      marginAfter: number,
    }),
    private getLookaheadDelay: () => number,
  ) {
    this.speedUpGain = context.createGain();
    this.slowDownGain = context.createGain();
    this.normalSpeedGain = context.createGain();
    this.speedUpGain.gain.value = 0;
    this.slowDownGain.gain.value = 0
    this.normalSpeedGain.gain.value = 1;

    const oldToneContext = toneGetContext();
    toneSetContext(context);
    this.toneContext = toneGetContext();
    oldToneContext.dispose();
    this.speedUpPitchShift = new PitchShift();
    this.slowDownPitchShift = new PitchShift();

    // Why this value?
    // 1. Withing the range recommended by Tone.js documentation:
    // https://tonejs.github.io/docs/14.7.39/PitchShift#windowSize
    // 2. I played around with it a bit and this sounded best for me.
    // TODO make it into a setting?
    const windowSize = 0.1;
    this.speedUpPitchShift.windowSize = windowSize;
    this.slowDownPitchShift.windowSize = windowSize;

    // `PitchShift` nodes introduce a delay:
    // https://github.com/Tonejs/Tone.js/blob/ed0d3b08be2b95220fffe7cce7eac32a5b77580e/Tone/effect/PitchShift.ts#L97-L117
    // This is so their outputs and original pitch outputs are in sync.
    const averagePitchShiftDelay = windowSize / 2;
    this.originalPitchCompensationDelay = context.createDelay(averagePitchShiftDelay);
    this.originalPitchCompensationDelay.delayTime.value = averagePitchShiftDelay;
    this.delayNode = context.createDelay(maxDelay);
    this.delayNode.delayTime.value = initialDelay;

    this.delayNode.connect(this.speedUpGain);
    this.delayNode.connect(this.slowDownGain);
    this.delayNode.connect(this.normalSpeedGain);

    ToneConnect(this.speedUpGain, this.speedUpPitchShift);
    ToneConnect(this.slowDownGain, this.slowDownPitchShift);
    this.normalSpeedGain.connect(this.originalPitchCompensationDelay);
  }

  connectInputFrom(sourceNode: AudioNode): void {
    sourceNode.connect(this.delayNode);
  }
  connectOutputTo(destinationNode: AudioNode): void {
    this.speedUpPitchShift.connect(destinationNode)
    this.slowDownPitchShift.connect(destinationNode)
    this.originalPitchCompensationDelay.connect(destinationNode)
  }

  onSilenceEnd(eventTime: Time): void {
    // TODO all this does look like it may cause a snowballing floating point error. Mathematically simplify this?
    // Or just use if-else?

    // These are guaranteed to be non-null, because `onSilenceStart` is always called before this function.
    assert(this.lastScheduledStretch && this.lastElementSpeedChangeAtInputTime);
    const lastScheduledStretcherDelayReset = this.lastScheduledStretch;
    const lastElementSpeedChangeAtInputTime = this.lastElementSpeedChangeAtInputTime;
    // Assuming that `element.playbackRate` assignment was done in `Controller.ts` (which it was).
    // Same in `onSilenceStart`.
    this.lastElementSpeedChangeAtInputTime = eventTime;

    const lookaheadDelay = this.getLookaheadDelay();
    const settings = this.getSettings();

    const lastSilenceSpeedLastsForRealtime =
      eventTime - lastElementSpeedChangeAtInputTime;
    const lastSilenceSpeedLastsForIntrinsicTime = lastSilenceSpeedLastsForRealtime * settings.silenceSpeed;

    const marginBeforePartAtSilenceSpeedIntrinsicTimeDuration = Math.min(
      lastSilenceSpeedLastsForIntrinsicTime,
      settings.marginBefore
    );
    const marginBeforePartAlreadyAtSoundedSpeedIntrinsicTimeDuration =
      settings.marginBefore - marginBeforePartAtSilenceSpeedIntrinsicTimeDuration;
    const marginBeforePartAtSilenceSpeedRealTimeDuration =
      marginBeforePartAtSilenceSpeedIntrinsicTimeDuration / settings.silenceSpeed;
    const marginBeforePartAlreadyAtSoundedSpeedRealTimeDuration =
      marginBeforePartAlreadyAtSoundedSpeedIntrinsicTimeDuration / settings.soundedSpeed;
    // The time at which the moment from which the speed of the video needs to be slow has been on the input.
    const marginBeforeStartInputTime =
      eventTime
      - marginBeforePartAtSilenceSpeedRealTimeDuration
      - marginBeforePartAlreadyAtSoundedSpeedRealTimeDuration;
    // Same, but when it's going to be on the output.
    const marginBeforeStartOutputTime = getMomentOutputTime(
      marginBeforeStartInputTime,
      lookaheadDelay,
      lastScheduledStretcherDelayReset
    );
    const marginBeforeStartOutputTimeTotalDelay = marginBeforeStartOutputTime - marginBeforeStartInputTime;
    const marginBeforeStartOutputTimeStretcherDelay =
      marginBeforeStartOutputTimeTotalDelay - lookaheadDelay;

    // As you remember, silence on the input must last for some time before we speed up the video.
    // We then speed up these sections by reducing the stretcher delay.
    // And sometimes we may stumble upon a silence period long enough to make us speed up the video, but short
    // enough for us to not be done with speeding up that last part, so the margin before and that last part
    // overlap, and we end up in a situation where we only need to stretch the last part of the margin before
    // snippet, because the first one is already at required (sounded) speed, due to that delay before we speed up
    // the video after some silence.
    // This is also the reason why `getMomentOutputTime` function is so long.
    // Let's find this breakpoint.

    if (marginBeforeStartOutputTime < lastScheduledStretcherDelayReset.endTime) {
      // Cancel the complete delay reset, and instead stop decreasing it at `marginBeforeStartOutputTime`.
      this.interruptLastScheduledStretch(
        // A.k.a. `lastScheduledStretcherDelayReset.startTime`
        marginBeforeStartOutputTimeStretcherDelay,
        marginBeforeStartOutputTime
      );
      // if (isLogging(this)) {
      //   this._log({
      //     type: 'pauseReset',
      //     value: marginBeforeStartOutputTimeStretcherDelay,
      //     time: marginBeforeStartOutputTime,
      //   });
      // }
    }

    const marginBeforePartAtSilenceSpeedStartOutputTime =
      marginBeforeStartOutputTime + marginBeforePartAlreadyAtSoundedSpeedRealTimeDuration
    // const silenceSpeedPartStretchedDuration = getNewSnippetDuration(
    //   marginBeforePartAtSilenceSpeedRealTimeDuration,
    //   settings.silenceSpeed,
    //   settings.soundedSpeed
    // );
    const stretcherDelayIncrease = getStretcherDelayChange(
      marginBeforePartAtSilenceSpeedRealTimeDuration,
      settings.silenceSpeed,
      settings.soundedSpeed
    );
    // I think currently it should always be equal to the max delay.
    const finalStretcherDelay = marginBeforeStartOutputTimeStretcherDelay + stretcherDelayIncrease;

    const startValue = marginBeforeStartOutputTimeStretcherDelay;
    const endValue = finalStretcherDelay;
    const startTime = marginBeforePartAtSilenceSpeedStartOutputTime;
    // A.k.a. `marginBeforePartAtSilenceSpeedStartOutputTime + silenceSpeedPartStretchedDuration`
    const endTime = eventTime + getTotalDelay(lookaheadDelay, finalStretcherDelay);
    this.stretch(startValue, endValue, startTime, endTime);
    // if (isLogging(this)) {
    //   this._log({ type: 'stretch', lastScheduledStretch: this.lastScheduledStretch });
    // }
  }
  onSilenceStart(eventTime: Time) {
    this.lastElementSpeedChangeAtInputTime = eventTime; // See the same assignment in `onSilenceEnd`.

    const settings = this.getSettings();

    const realtimeMarginBefore = getRealtimeMargin(settings.marginBefore, settings.soundedSpeed);
    // When the time comes to increase the video speed, the stretcher's delay is always at its max value.
    const stretcherDelayStartValue =
      getStretcherSoundedDelay(settings.marginBefore, settings.soundedSpeed, settings.silenceSpeed);
    const startIn = getTotalDelay(this.getLookaheadDelay(), stretcherDelayStartValue) - realtimeMarginBefore;

    const speedUpBy = settings.silenceSpeed / settings.soundedSpeed;

    const originalRealtimeSpeed = 1;
    const delayDecreaseSpeed = speedUpBy - originalRealtimeSpeed;
    const snippetNewDuration = stretcherDelayStartValue / delayDecreaseSpeed;
    const startTime = eventTime + startIn;
    const endTime = startTime + snippetNewDuration;
    this.stretch(
      stretcherDelayStartValue,
      0,
      startTime,
      endTime,
    );

    // if (isLogging(this)) {
    //   this._log({ type: 'reset', lastScheduledStretch: this.lastScheduledStretch });
    // }
  }

  private setOutputPitchAt(pitchSetting: PitchSetting, time: Time, oldPitchSetting: PitchSetting) {
    if (process.env.NODE_ENV !== 'production') {
      if (!['slowdown', 'speedup', 'normal'].includes(pitchSetting)) {
        // TODO replace with TypeScript?
        throw new Error(`Invalid pitchSetting "${pitchSetting}"`);
      }
      if (pitchSetting === oldPitchSetting) {
        console.warn(`New pitchSetting is the same as oldPitchSetting: ${pitchSetting}`);
      }
      if (
        pitchSetting === 'speedup' && oldPitchSetting === 'slowdown'
        || pitchSetting === 'slowdown' && oldPitchSetting === 'speedup'
      ) {
        console.warn(`Switching from ${oldPitchSetting} to ${pitchSetting} immediately. It hasn't been happening`
          + 'at the time of writing, so not sure if it works as intended.');
      }
    }

    // Cross-fade to avoid glitches.
    // TODO make sure the cross-fade behaves well in cases when `interruptLastScheduledStretch()` is called.
    const crossFadeHalfDuration = CROSS_FADE_DURATION / 2;
    const crossFadeStart = time - crossFadeHalfDuration;
    const crossFadeEnd = time + crossFadeHalfDuration;
    const pitchSettingToItsGainNode = {
      'normal': this.normalSpeedGain,
      'speedup': this.speedUpGain,
      'slowdown': this.slowDownGain,
    };
    const fromNode = pitchSettingToItsGainNode[oldPitchSetting];
    const toNode = pitchSettingToItsGainNode[pitchSetting];
    fromNode.gain.setValueAtTime(1, crossFadeStart);
    toNode.gain.setValueAtTime(0, crossFadeStart);
    fromNode.gain.linearRampToValueAtTime(0, crossFadeEnd);
    toNode.gain.linearRampToValueAtTime(1, crossFadeEnd);
  }

  stretch(startValue: Time, endValue: Time, startTime: Time, endTime: Time): void {
    if (startValue === endValue) {
      return;
    }

    this.delayNode.delayTime
      .setValueAtTime(startValue, startTime)
      .linearRampToValueAtTime(endValue, endTime);
    const speedupOrSlowdown = endValue > startValue ? 'slowdown' : 'speedup';
    this.setOutputPitchAt(
      speedupOrSlowdown,
      startTime,
      'normal'
    );
    this.setOutputPitchAt('normal', endTime, speedupOrSlowdown);
    
    const speedChangeMultiplier = getStretchSpeedChangeMultiplier({ startValue, endValue, startTime, endTime });
    // So it is changed a bit earlier to make sure that tail time has passed and the pitch value is what we want it to
    // be.
    const earlierBy = 0.05;
    // Acutally we only need to do this when the user changes settings.
    setTimeout(() => {
      function speedChangeMultiplierToSemitones(m: number) {
        return -12 * Math.log2(m);
      }
      const node = speedupOrSlowdown === 'speedup'
        ? this.speedUpPitchShift
        : this.slowDownPitchShift;
      node.pitch = speedChangeMultiplierToSemitones(speedChangeMultiplier);
    }, (startTime - this.context.currentTime - earlierBy) * 1000);

    this.lastScheduledStretch = {
      startValue,
      endValue,
      startTime,
      endTime,
      speedupOrSlowdown,
    };
  }

  /**
   * @param interruptAtTime the time at which to stop changing the delay.
   * @param interruptAtTimeValue the value of the delay at `interruptAtTime`
   */
  private interruptLastScheduledStretch(interruptAtTimeValue: Time, interruptAtTime: Time): void {
    assert(this.lastScheduledStretch, 'Called `interruptLastScheduledStretch`, but no stretch has been scheduled '
      + 'yet');
    // We don't need to specify the start time since it has been scheduled before in the `stretch` method
    this.delayNode.delayTime
      .cancelScheduledValues(interruptAtTime)
      .linearRampToValueAtTime(interruptAtTimeValue, interruptAtTime);

    const allGainNodes = [
      this.speedUpGain,
      this.slowDownGain,
      this.normalSpeedGain,
    ];
    for (const node of allGainNodes) {
      node.gain.cancelScheduledValues(interruptAtTime);
    }
    this.setOutputPitchAt('normal', interruptAtTime, this.lastScheduledStretch.speedupOrSlowdown);
  }

  // setDelay(value: Time): void {
  //   this.delayNode.delayTime.value = value;
  // }
  onSettingsUpdate(): void {
    const newSettings = this.getSettings();
    this.delayNode.delayTime.value = getStretcherSoundedDelay(
      newSettings.marginBefore,
      newSettings.soundedSpeed,
      newSettings.silenceSpeed
    );
  }

  destroy(): void {
    const toneAudioNodes = [this.speedUpPitchShift, this.slowDownPitchShift];
    for (const node of toneAudioNodes) {
      node.dispose();
    }
    
    if (process.env.NODE_ENV !== 'production') {
      Object.values(this).forEach(propertyVal => {
        if (propertyVal instanceof ToneAudioNode && !(toneAudioNodes as ToneAudioNode[]).includes(propertyVal)) {
          console.warn('Undisposed ToneAudioNode found. Expected all to be disposed upon `destroy()` call');
        }
      })
    }

    this.toneContext.dispose();
  }
}
