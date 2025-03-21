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
declare const currentFrame: number;
declare const currentTime: number;
declare function registerProcessor(
  name: string,
  processorCtor: (new (
    options?: AudioWorkletNodeOptions
  ) => AudioWorkletProcessor) & {
    parameterDescriptors?: AudioParamDescriptor[];
  }
): unknown;
