'use strict';

class VolumeFilter extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    // Lazy implementation, just computing volume for the current chunk of samples.
    const input = inputs[0];
    let sum = 0;
    const numChannels = input.length;
    for (let channelI = 0; channelI < numChannels; channelI++) {
      const channel = input[channelI];
      const numSamples = channel.length;
      for (let sampleI = 0; sampleI < numSamples; sampleI++) {
        const sample = channel[sampleI];
        sum += sample * sample;
      }
    }
    const numSamples = input.length * input[0].length;
    const volume = Math.sqrt(sum / numSamples);

    const output = outputs[0];
    for (let channelI = 0; channelI < numChannels; channelI++) {
      const channel = output[channelI];
      const numSamples = channel.length;
      for (let sampleI = 0; sampleI < numSamples; sampleI++) {
        channel[sampleI] = volume;
      }
    }

    return true;
  }
}

registerProcessor('VolumeFilter', VolumeFilter);
