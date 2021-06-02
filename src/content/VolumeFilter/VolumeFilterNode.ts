import { Time } from "@/helpers"

export default class VolumeFilterNode extends AudioWorkletNode {
  constructor(context: AudioContext, maxSmoothingWindowLength: Time, smoothingWindowLength: Time) {
    super(context, 'VolumeFilter', {
      outputChannelCount: [1],
      processorOptions: {
        maxSmoothingWindowLength,
      },
      parameterData: {
        smoothingWindowLength,
      },
    });
  }
}
