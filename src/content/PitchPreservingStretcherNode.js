// import { PitchShift, connect as ToneConnect, setContext as toneSetContext, ToneAudioNode } from 'tone';
import PitchShift from './jungle';
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

    this.speedUpPitchShift = new PitchShift(context);
    this.slowDownPitchShift = new PitchShift(context);

    this.delayNode = context.createDelay(maxDelay);
    this.delayNode.delayTime.value = initialDelay;

    this.delayNode.connect(this.speedUpPitchShift.input);
    this.delayNode.connect(this.slowDownPitchShift.input);

    this.delayNode.connect(this.normalSpeedGain);

    this.speedUpPitchShift.output.connect(this.slowDownGain);
    this.slowDownPitchShift.output.connect(this.speedUpGain);

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
      // function speedChangeMultiplierToSemitones(m) {
      //   return -12 * Math.log2(1 / m);
      // }
      function speedChangeMultiplierToOctaves(m) {
        // TODO figure out the formula
        // Roughly:
        // 2 sounds good for x1.1 & x2.2
        // 4 sounds good for x1.1 & x3.3

        return 7;

        // return -1 * Math.log2(1 / m);
      }
      const node = speedupOrSlowdown === 'speedup'
        ? this.speedUpPitchShift
        : this.slowDownPitchShift;
      node.setPitchOffset(speedChangeMultiplierToOctaves(speedChangeMultiplier));
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

  destroy() {}
}
