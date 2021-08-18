import WorkaroundAudioWorkletProcessor from '../WorkaroundAudioWorkletProcessor';
import type { TimeDelta } from '@/helpers';

const SAMPLES_PER_QUANTUM = 128;
// This is the minimum number a broswer should support, apparently. TODO make sure this is correct.
// https://webaudio.github.io/web-audio-api/#BaseAudioContent-methods
const DEFAULT_MAX_NUM_CHANNELS = 32;

function windowLengthNumSecondsToSamples(numSeconds: TimeDelta) {
  // Why round? Because there may be a sligh difference between a custom parameter (`maxSmoothingWindowLength`) and
  // `process()`'s `parameters.smoothingWindowLength[0]` even if they were the same number at the time of passing to the
  // processor constructor (I assume because one is float32, the other is float64).
  // The error is pretty small and I don't know which way it can go (less than the exact number, or greater).
  // But `round` doesn't care about such small errors.
  return Math.round(numSeconds * sampleRate);
}

class SingleChannelRingBuffer extends Float32Array {
  private _lastSampleI: number;
  constructor(length: number) {
    super(length);
    this._lastSampleI = length - 1;
  }
  push(val: unknown) {
    ++this._lastSampleI;
    if (this._lastSampleI >= this.length) {
      this._lastSampleI = 0;
    }
    (this[this._lastSampleI] as unknown) = val;
  }
  /**
   * @param depth how many elements have been pushed after the one that we want to get.
   */
  getReverse(depth: number) {
    if (process.env.NODE_ENV !== 'production') {
      if (depth >= this.length) {
        throw new RangeError();
      }
    }
    return this[(this._lastSampleI - depth + this.length) % this.length];
  }
}

let devErrorShown = false;

// Simple rectangular window and RMS.
class VolumeFilterProcessor extends WorkaroundAudioWorkletProcessor {
  _sampleSquaresRingBuffer: SingleChannelRingBuffer;
  _currWindowSquaresSum: number;
  _options: any;
  constructor(options: any, ...rest: unknown[]) {
    super(options, ...rest);
    this._currWindowSquaresSum = 0;
    this._options = {
      maxChannels: DEFAULT_MAX_NUM_CHANNELS,
      maxSmoothingWindowLength: options.parameterData.smoothingWindowLength,
      ...options.processorOptions,
    };
    const bufferLength = windowLengthNumSecondsToSamples(this._options.maxSmoothingWindowLength);
    this._sampleSquaresRingBuffer = new SingleChannelRingBuffer(bufferLength);
  }
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      // The length (duration, one could say) of the window, values of which affect the output.
      {
        name: 'smoothingWindowLength',
        defaultValue: 0.02,
        minValue: 0,
        // maxValue: this._options.maxSmoothingWindowLength? But it's static.
        automationRate: 'k-rate',
      },
    ];
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const smoothingWindowLength = parameters.smoothingWindowLength[0];
    const smoothingWindowLengthSamples = windowLengthNumSecondsToSamples(smoothingWindowLength);

    if (process.env.NODE_ENV !== 'production') {
      if (
        smoothingWindowLengthSamples !== windowLengthNumSecondsToSamples(this._options.maxSmoothingWindowLength)
        && !devErrorShown
      ) {
        console.error('Looks like you\'ve started dynamically changing `smoothingWindowLength`. You\'ll probably need'
          + ' to revert the commit that introduced this change.', smoothingWindowLength, this._options.maxSmoothingWindowLength)
        devErrorShown = true;
      }
    }

    const input = inputs[0];
    if (input.length === 0) {
      return this.keepAlive;
    }
    const outputChannel = outputs[0][0]; // Single output, single channel.
    const numChannels = input.length;
    const numSamples = input[0].length;

    if (process.env.NODE_ENV !== 'production') {
      if (numSamples !== SAMPLES_PER_QUANTUM) {
        throw new Error('Splish-splash. Your assumptions about quantum length are trash');
      }
    }

    for (let sampleI = 0; sampleI < numSamples; sampleI++) {
      let allChannelsSampleSquareSum = 0;
      for (let channelI = 0; channelI < input.length; channelI++) {
        const sample = input[channelI][sampleI];
        allChannelsSampleSquareSum += sample ** 2;
      }
      // TODO are you sure this has to be RMS? It's for a single moment in time for multiple channels, not over time.
      const allChannelsSampleMeanSquare = allChannelsSampleSquareSum / numChannels;

      // As long as we use a rectangular window, we can just subtract the value of the sample that leaves the window and
      // add the value of the sample that enters it.
      // TODO I believe floating point error may snowball here over time? Better compute it from scratch on each cycle,
      // like a normal person.
      // TODO handle the case when smoothingWindowLength is shorter than `SAMPLES_PER_QUANTUM`.
      const lastWindowSampleSquare =
        this._sampleSquaresRingBuffer.getReverse((smoothingWindowLengthSamples - 1));
      this._currWindowSquaresSum -= lastWindowSampleSquare;
      this._currWindowSquaresSum += allChannelsSampleMeanSquare;
      // Dunno, it becomes negative from time to time.
      // TODO maybe it's time to put down your `_currWindowSquaresSum` "performance optimization".
      this._currWindowSquaresSum = Math.max(this._currWindowSquaresSum, 0);
      this._sampleSquaresRingBuffer.push(allChannelsSampleMeanSquare);

      const currVolume = Math.sqrt(this._currWindowSquaresSum / smoothingWindowLengthSamples);
      outputChannel[sampleI] = currVolume;
    }

    return this.keepAlive;
  }
}

registerProcessor('VolumeFilter', VolumeFilterProcessor);
