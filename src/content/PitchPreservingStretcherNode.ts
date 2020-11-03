import { PitchShift, connect as ToneConnect, setContext as toneSetContext, ToneAudioNode } from 'tone';
import { getStretchSpeedChangeMultiplier } from './helpers';
import type { Time, StretchInfo } from '@/helpers';
import { assert } from '@/helpers';


// TODO make it into a setting?
const CROSS_FADE_DURATION = 0.01;

type PitchSetting = 'slowdown' | 'speedup' | 'normal';

export default class PitchPreservingStretcherNode {
  // 2 pitch shifts and 3 gains because `.pitch` of `PitchShift` is not an AudioParam, therefore doesn't support
  // scheduling.
  context: AudioContext;
  speedUpGain: GainNode;
  slowDownGain: GainNode;
  normalSpeedGain: GainNode;
  speedUpPitchShift: PitchShift;
  slowDownPitchShift: PitchShift;
  originalPitchCompensationDelay: DelayNode;
  delayNode: DelayNode;
  _lastScheduledStretch?:
    Pick<StretchInfo, 'startValue' | 'endValue' | 'startTime' | 'endTime'>
    & { speedupOrSlowdown: 'speedup' | 'slowdown' };

  constructor(context: AudioContext, maxDelay: Time, initialDelay: Time = 0) {
    this.context = context;

    this.speedUpGain = context.createGain();
    this.slowDownGain = context.createGain();
    this.normalSpeedGain = context.createGain();
    this.speedUpGain.gain.value = 0;
    this.slowDownGain.gain.value = 0
    this.normalSpeedGain.gain.value = 1;

    toneSetContext(context);
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
    // Acutally we only need to do this when the user changes settings.
    setTimeout(() => {
      function speedChangeMultiplierToSemitones(m: number) {
        return -12 * Math.log2(m);
      }
      const node = speedupOrSlowdown === 'speedup'
        ? this.speedUpPitchShift
        : this.slowDownPitchShift;
      node.pitch = speedChangeMultiplierToSemitones(speedChangeMultiplier);
    }, startTime - this.context.currentTime);

    this._lastScheduledStretch = {
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
  interruptLastScheduledStretch(interruptAtTimeValue: Time, interruptAtTime: Time): void {
    assert(this._lastScheduledStretch, 'Called `interruptLastScheduledStretch`, but no stretch has been scheduled '
      + 'yet');
    // We don't need to specify the start time since it has been scheduled before in the `stretch` method
    this.delayNode.delayTime
      .cancelAndHoldAtTime(interruptAtTime)
      .linearRampToValueAtTime(interruptAtTimeValue, interruptAtTime);

    const allGainNodes = [
      this.speedUpGain,
      this.slowDownGain,
      this.normalSpeedGain,
    ];
    for (const node of allGainNodes) {
      node.gain.cancelAndHoldAtTime(interruptAtTime);
    }
    this.setOutputPitchAt('normal', interruptAtTime, this._lastScheduledStretch.speedupOrSlowdown);
  }

  setDelay(value: Time): void {
    this.delayNode.delayTime.value = value;
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
  }
}
