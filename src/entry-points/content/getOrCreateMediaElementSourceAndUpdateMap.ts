/**
 * @license
 * Copyright (C) 2020, 2021, 2022, 2023  WofWca <wofwca@protonmail.com>
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

// Doing it the way it's suggested in https://stackoverflow.com/a/39725071/10406353
export const mediaElementSourcesMap:
  WeakMap<HTMLMediaElement, [AudioContext, MediaElementAudioSourceNode]>
  = new WeakMap();

/**
 * @param getDefaultAudioContext must return an AudioContext that is gonna be used when
 * `createMediaElementSource` has not been called for the `element` yet.
 */
export function getOrCreateMediaElementSourceAndUpdateMap(
  element: HTMLMediaElement,
  getDefaultAudioContext: () => AudioContext,
): [AudioContext, MediaElementAudioSourceNode] {
  const fromMap = mediaElementSourcesMap.get(element);
  // let mediaElementSource: MediaElementAudioSourceNode;
  if (fromMap) {
    const mediaElementSource = fromMap[1];
    // Act as if it's the first time that `createMediaElementSource` is called for the element
    // (i.e. it's not connected to anything, not even `context.destination`).
    mediaElementSource.disconnect();
    return fromMap;
  } else {
    const audioContext = getDefaultAudioContext();
    const mediaElementSource = audioContext.createMediaElementSource(element);
    const tuple: [AudioContext, MediaElementAudioSourceNode]
      = [audioContext, mediaElementSource];
    mediaElementSourcesMap.set(element, tuple);
    return tuple;
  }
}
