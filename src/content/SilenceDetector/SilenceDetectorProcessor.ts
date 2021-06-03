import WorkaroundAudioWorkletProcessor from '../WorkaroundAudioWorkletProcessor';
import { SilenceDetectorMessage, SilenceDetectorEventType } from './SilenceDetectorMessage';
import { Time } from "@/helpers";

const assumeSoundedWhenUnknown = true;

/**
 * Takes volume data (e.g. from `VolumeFilter`) as input. Sends `SILENCE_START` when there has been silence for the
 * last `durationThreshold`, or `SILENCE_END` when a single sample above `volumeThreshold` is found.
 */
class SilenceDetectorProcessor extends WorkaroundAudioWorkletProcessor {
  _lastLoudSampleTime: Time;
  _lastTimePostedSilenceStart: boolean;
  constructor(options: any) {
    super(options);
    const initialDuration = options.processorOptions.initialDuration ?? 0;
    this._lastLoudSampleTime = currentTime - initialDuration;
    const thresholdSamples = sampleRate * options.parameterData.durationThreshold;
    this._lastTimePostedSilenceStart = this.isPastDurationThreshold(thresholdSamples);
  }
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      {
        name: 'volumeThreshold',
        defaultValue: 0.10, // TODO DRY.
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        // Don't do anything if silence lasts shorter than this.
        name: 'durationThreshold',
        minValue: 0,
        automationRate: 'k-rate',
      },
    ];
  }

  // Just so we don't mess up `>=` and `>` somewhere.
  isPastDurationThreshold(durationThreshold: number) {
    return currentTime >= this._lastLoudSampleTime + durationThreshold;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const volumeThreshold = parameters.volumeThreshold[0];
    const input = inputs[0];
    if (input.length === 0) {
      if (!assumeSoundedWhenUnknown) {
        throw new Error('The below code assumes video parts to be sounded when it is unknown');
      }
      this._lastLoudSampleTime = currentTime;
      return this.keepAlive;
    }
    const numSamples = input[0].length;
    for (let sampleI = 0; sampleI < numSamples; sampleI++) {
      let loudSampleFound = false;
      for (let channelI = 0; channelI < input.length; channelI++) {
        const sample = input[channelI][sampleI];
        if (sample >= volumeThreshold) {
          loudSampleFound = true;
          break;
        }
      }
      if (loudSampleFound) {
        this._lastLoudSampleTime = currentTime;
        if (this._lastTimePostedSilenceStart) {
          // console.log('lastStart:', this._lastTimePostedSilenceStart, this._lastLoudSampleTime, currentTime - this._lastLoudSampleTime);
          const m: SilenceDetectorMessage = [SilenceDetectorEventType.SILENCE_END, currentTime];
          this.port.postMessage(m);
          this._lastTimePostedSilenceStart = false;
        }
      } else {
        if (!this._lastTimePostedSilenceStart && this.isPastDurationThreshold(parameters.durationThreshold[0])) {
          // console.log('lastStart:', this._lastTimePostedSilenceStart, this._lastLoudSampleTime, currentTime - this._lastLoudSampleTime);
          const m: SilenceDetectorMessage = [SilenceDetectorEventType.SILENCE_START, currentTime];
          this.port.postMessage(m);
          this._lastTimePostedSilenceStart = true;
        }
      }
    }
    return this.keepAlive;
  }
}

registerProcessor('SilenceDetectorProcessor', SilenceDetectorProcessor);
