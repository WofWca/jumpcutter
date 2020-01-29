class ThresholdDetectorProcessor extends AudioWorkletProcessor {
  constructor(...args) {
    super(...args);
    // Semantically this should be lastTimePosted: 'above' | 'below' | undefined, but we're trying to improve
    // performance a bit. This may be not worth it.
    this.lastTimePostedBelow = false; // TODO we didn't actually post anthing, so this should be `undefined`.
  }
  static get parameterDescriptors() {
    return [{
      name: 'volumeThreshold',
      defaultValue: 0.10, // TODO DRY.
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    }];
  }

  process(inputs, outputs, parameters) {
    const threshold = parameters.volumeThreshold[0];
    let hasBeenAboveInThisChunk = false;
    inputs.forEach(input => {
      input.forEach(channel => {
        channel.forEach(sample => {
          const currVol = Math.abs(sample);
          // Eager to post 'above'...
          if (currVol >= threshold) {
            if (this.lastTimePostedBelow) {
              this.port.postMessage('above');
              this.lastTimePostedBelow = false;
            }
            hasBeenAboveInThisChunk = true;
          }
        });
      });
    });
    // Lazy to post 'below'.
    if (!this.lastTimePostedBelow && !hasBeenAboveInThisChunk) {
      this.port.postMessage('below');
      this.lastTimePostedBelow = true;
    }
    return true
  }
}

registerProcessor('ThresholdDetectorProcessor', ThresholdDetectorProcessor);
