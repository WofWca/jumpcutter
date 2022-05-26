import type { TimeDelta } from "@/helpers"

export default class VolumeFilterNode extends AudioWorkletNode {
  constructor(context: AudioContext, maxSmoothingWindowLength: TimeDelta, smoothingWindowLength: TimeDelta) {
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
