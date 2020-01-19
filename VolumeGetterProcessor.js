class VolumeGetterProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    let maxChunkVolume = 0;
    let currOutput, currOutputChannel;
    inputs.forEach((input, inputI) => {
      currOutput = outputs[inputI];
      input.forEach((channel, channelI) => {
        currOutputChannel = currOutput[channelI]
        // outputs[inputI][channelI] = channel;
        channel.forEach((sample, sampleI) => {
          currOutputChannel[sampleI] = sample;

          const currVol = Math.abs(sample);
          if (currVol > maxChunkVolume) {
            maxChunkVolume = currVol;
          }
        });
      });
    });
    this.port.postMessage(maxChunkVolume);
    return true
  }
}

registerProcessor('VolumeGetterProcessor', VolumeGetterProcessor);
