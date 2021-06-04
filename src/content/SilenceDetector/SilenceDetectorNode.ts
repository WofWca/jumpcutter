export * from './SilenceDetectorMessage';

export default class SilenceDetectorNode extends AudioWorkletNode {
  constructor(context: AudioContext, durationThreshold: number) {
    super(context, 'SilenceDetectorProcessor', {
      parameterData: {
        durationThreshold,
      },
      processorOptions: { initialDuration: 0 },
      numberOfOutputs: 0,
    });
  }
  set volumeThreshold(v: number) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.parameters.get('volumeThreshold')!.value = v;
  }
  set durationThreshold(v: number) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.parameters.get('durationThreshold')!.value = v;
  }
}
