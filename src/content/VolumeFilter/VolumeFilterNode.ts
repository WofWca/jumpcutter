import { Time } from "@/helpers"

export default class VolumeFilterNode extends AudioWorkletNode {
  constructor(context: AudioContext, maxSmoothingWindowLength: Time, smoothingWindowLength: Time) {
    super(context, 'VolumeFilter', {
      outputChannelCount: [1],
      // TODO see the same comment in `SilenceDetectorNode.ts`.
      // processorOptions: {
      //   maxSmoothingWindowLength,
      // },
      parameterData: {
        smoothingWindowLength,
      },
    });
  }
}
