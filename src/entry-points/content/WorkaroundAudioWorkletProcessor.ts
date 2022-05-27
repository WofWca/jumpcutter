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

// https://bugs.chromium.org/p/chromium/issues/detail?id=921354. Once it's resolved, worklets can inherit from
// AudioWorkletProcessor. You can check out this commit's changes to see what to revert. TODO.
export default class WorkaroundAudioWorkletProcessor extends AudioWorkletProcessor {
  keepAlive: boolean;
  constructor(...args: ConstructorParameters<typeof AudioWorkletProcessor>) {
    super(...args);
    this.keepAlive = true;
    this.port.onmessage = e => {
      if (e.data === 'destroy') {
        this.keepAlive = false;
      }
    }
  }
}
