import { PitchShift, connect as ToneConnect, setContext as toneSetContext, ToneAudioNode } from 'tone';
import { getStretchSpeedChangeMultiplier } from './helpers';

export default class PitchPreservingStretcherNode {
  // 2 pitch shifts and 3 gains because `.pitch` of `PitchShift` is not an AudioParam, therefore doesn't support
  // scheduling.

  /**
   * @param {AudioContext} context
   */
  constructor(context, maxDelay, initialDelay=0) {
    this.context = context;

    this.speedUpGain = context.createGain();
    this.slowDownGain = context.createGain();
    this.normalSpeedGain = context.createGain();

    toneSetContext(context);
    this.speedUpPitchShift = new PitchShift();
    this.slowDownPitchShift = new PitchShift();

    // Why this value?
    // 1. Withing the range recommended by Tone.js documentation:
    // https://tonejs.github.io/docs/13.8.25/PitchShift#windowsize
    // 2. I played around with it a bit and this sounded best for me.
    // TODO make it into a setting?
    const windowSize = 0.06;
    this.speedUpPitchShift.windowSize = windowSize;
    this.slowDownPitchShift.windowSize = windowSize;

    this.delayNode = context.createDelay(maxDelay);
    this.delayNode.delayTime.value = initialDelay;

    ToneConnect(this.delayNode, this.speedUpPitchShift);
    ToneConnect(this.delayNode, this.slowDownPitchShift);

    this.delayNode.connect(this.normalSpeedGain);

    this.speedUpPitchShift.connect(this.slowDownGain);
    this.slowDownPitchShift.connect(this.speedUpGain);

    this.setOutputPitchAt('normal', context.currentTime);
  }

  get allGainNodes() {
    return [
      this.speedUpGain,
      this.slowDownGain,
      this.normalSpeedGain,
    ];
  }

  /**
   * @param {AudioNode} sourceNode
   */
  connectInputFrom(sourceNode) {
    sourceNode.connect(this.delayNode);
  }
  /**
   * @param {AudioNode} destinationNode
   */
  connectOutputTo(destinationNode) {
    for (const node of this.allGainNodes) {
      node.connect(destinationNode);
    }
  }

  /**
   * @param {'slowdown' | 'speedup' | 'normal'} pitchSetting
   */
  setOutputPitchAt(pitchSetting, time) {
    if (process.env.NODE_ENV !== 'production') {
      if (!['slowdown', 'speedup', 'normal'].includes(pitchSetting)) {
        // TODO replace with TypeScript?
        throw new Error(`Invalid pitchSetting "${pitchSetting}"`);
      }
    }

    this.speedUpGain    .gain.setValueAtTime(pitchSetting === 'speedup'  ? 1 : 0, time);
    this.slowDownGain   .gain.setValueAtTime(pitchSetting === 'slowdown' ? 1 : 0, time);
    this.normalSpeedGain.gain.setValueAtTime(pitchSetting === 'normal'   ? 1 : 0, time);
  }

  stretch(startValue, endValue, startTime, endTime) {
    if (startValue === endValue) {
      return;
    }

    this.delayNode.delayTime
      .setValueAtTime(startValue, startTime)
      .linearRampToValueAtTime(endValue, endTime);
    const speedupOrSlowdown = endValue > startValue ? 'slowdown' : 'speedup';
    this.setOutputPitchAt(
      speedupOrSlowdown,
      startTime
    );
    this.setOutputPitchAt('normal', endTime);
    
    const speedChangeMultiplier = getStretchSpeedChangeMultiplier({ startValue, endValue, startTime, endTime });
    // Acutally we only need to do this when the user changes settings.
    setTimeout(() => {
      function speedChangeMultiplierToSemitones(m) {
        return -12 * Math.log2(1 / m);
      }
      const node = speedupOrSlowdown === 'speedup'
        ? this.speedUpPitchShift
        : this.slowDownPitchShift;
      node.pitch = speedChangeMultiplierToSemitones(speedChangeMultiplier);
    }, startTime - this.context.currentTime);
  }

  /**
   * @param {number} interruptAtTime the time at which to stop changing the delay.
   * @param {number} interruptAtTimeValue the value of the delay at `interruptAtTime`
   */
  interruptLastScheduledStretch(interruptAtTimeValue, interruptAtTime) {
    // We don't need to specify the start time since it has been scheduled before in the `stretch` method
    this.delayNode.delayTime
      .cancelAndHoldAtTime(interruptAtTime)
      .linearRampToValueAtTime(interruptAtTimeValue, interruptAtTime);

    for (const node of this.allGainNodes) {
      node.gain.cancelAndHoldAtTime(interruptAtTime);
    }
    this.setOutputPitchAt('normal', interruptAtTime);
  }

  /**
   * @param {number} value
   */
  setDelay(value) {
    this.delayNode.value = value;
  }

  destroy() {
    const toneAudioNodes = [this.speedUpPitchShift, this.slowDownPitchShift];
    for (const node of toneAudioNodes) {
      node.dispose();
    }
    
    if (process.env.NODE_ENV !== 'production') {
      Object.values(this).forEach(propertyVal => {
        if (propertyVal instanceof ToneAudioNode && !toneAudioNodes.includes(propertyVal)) {
          console.warn('Undisposed ToneAudioNode found. Expected all to be disposed upon `destroy()` call');
        }
      })
    }
  }
}
