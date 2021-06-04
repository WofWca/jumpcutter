export * from './SilenceDetectorMessage';

export default class SilenceDetectorNode extends AudioWorkletNode {
  constructor(context: AudioContext, durationThreshold: number) {
    super(context, 'SilenceDetectorProcessor', {
      parameterData: {
        durationThreshold,
      },
      // TODO in Gecko 91.0a1 (https://hg.mozilla.org/mozilla-central/file/3350b68026ed51868a2100acb87d1833d61ac486)
      // passing `processorOptions` gives an error: "DataCloneError: The object could not be cloned".
      // Need to report this bug.
      // Revert this commit when it's gone.
      // processorOptions: { initialDuration: 0 },
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
