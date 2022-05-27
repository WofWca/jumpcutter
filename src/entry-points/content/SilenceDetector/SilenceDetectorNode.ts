/**
 * @license
 * Copyright (C) 2021, 2022  WofWca <wofwca@protonmail.com>
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
    // TODO a workaround. Otherwise when you create an instance of `SilenceDetectorNode`, it appears to not have
    // the below `volumeThreshold` & `durationThreshold` setters.
    // Need to report this bug.
    if (BUILD_DEFINITIONS.BROWSER === 'gecko') {
      Object.setPrototypeOf(this, SilenceDetectorNode.prototype);
    }
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
