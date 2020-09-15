// Hacky. Using this: https://github.com/Microsoft/TypeScript/issues/28308#issuecomment-650802278. TODO.
interface AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}
declare const AudioWorkletProcessor: {
  prototype: AudioWorkletProcessor;
  new(options?: AudioWorkletNodeOptions, ...rest: unknown[]): AudioWorkletProcessor;
  readonly parameterDescriptors: AudioParamDescriptor[];
};
declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(
  name: string,
  processorCtor: (new (
    options?: AudioWorkletNodeOptions
  ) => AudioWorkletProcessor) & {
    parameterDescriptors?: AudioParamDescriptor[];
  }
): unknown;
