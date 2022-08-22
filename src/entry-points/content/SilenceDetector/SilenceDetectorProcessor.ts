/**
 * @license
 * Copyright (C) 2020, 2021, 2022  WofWca <wofwca@protonmail.com>
 *
 * This file is part of Jump Cutter Browser Extension.
 *
 * Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jump Cutter Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
 */

import WorkaroundAudioWorkletProcessor from '../WorkaroundAudioWorkletProcessor';
import { SilenceDetectorMessage, SilenceDetectorEventType } from './SilenceDetectorMessage';
import type { AudioContextTime } from "@/helpers";

const assumeSoundedWhenUnknown = true;

let devErrorShown = false;

/**
 * Takes volume data (e.g. from `VolumeFilter`) as input. Sends `SILENCE_START` when there has been silence for the
 * last `durationThreshold`, or `SILENCE_END` when a single sample above `volumeThreshold` is found.
 */
class SilenceDetectorProcessor extends WorkaroundAudioWorkletProcessor {
  _lastLoudSampleTime: AudioContextTime;
  _lastTimePostedSilenceStart: boolean;
  constructor(options: any) {
    super(options);
    const initialDuration = options.processorOptions?.initialDuration ?? 0;
    this._lastLoudSampleTime = currentTime - initialDuration;
    const thresholdSamples = sampleRate * options.parameterData.durationThreshold;
    this._lastTimePostedSilenceStart = this.isPastDurationThreshold(thresholdSamples);
  }
  static get parameterDescriptors() {
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
    // TODO perf: can we stop checking this every time after we get an input connected?
    if (input.length === 0) {
      if (!assumeSoundedWhenUnknown) {
        throw new Error('The below code assumes video parts to be sounded when it is unknown');
      }
      this._lastLoudSampleTime = currentTime;
      return this.keepAlive;
    }

    if (IS_DEV_MODE) {
      const numChannels = input.length;
      if (numChannels !== 1 && !devErrorShown) {
        // See `VolumeFilterProcessor`. It funnels all the channels into a single one.
        // If it's no longer the case, revert the commit that introduced this check.
        console.error('SilenceDetectorProcessor assumes that there\'s only one channel on its input');
        devErrorShown = true;
      }
    }

    const channel = input[0];
    const numSamples = input[0].length;
    for (let sampleI = 0; sampleI < numSamples; sampleI++) {
      const sample = channel[sampleI];
      const sampleIsLoud = sample >= volumeThreshold;
      if (sampleIsLoud) {
        // TODO refactor: it is not quite corrent to use `currentTime` the time must actually depend on `sampleI`.
        // This gives an error of up to 128/44100=2.9ms. Consider using `currentFrame` and `sampleRate` instead.
        // https://webaudio.github.io/web-audio-api/#ref-for-dom-baseaudiocontext-current-frame-slot%E2%91%A0
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
