/**
 * @license
 * Copyright (C) 2023  WofWca <wofwca@protonmail.com>
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

/**
 * Create a clone `HTMLMediaElement` that uses the same source as the original one.
 */
export function createCloneElementWithSameSrc(
  originalElement: HTMLMediaElement,
): HTMLAudioElement {
  // Also see {@link `getOriginalMediaSource`}. It is very similar.
  // Maybe even too similar.

  const cloneEl = document.createElement('audio');

  // TODO fix: this probably doesn't cover all cases. Maybe it's better to just
  // `originalElement.cloneNode(true)`?
  // TODO fix: also need to watch for _changes_ of `crossOrigin`
  // (in `ElementPlaybackControllerCloning.ts`).
  // TODO wait, we gotta do the same for the `MediaSource` clone element, no?
  cloneEl.crossOrigin = originalElement.crossOrigin;

  // https://html.spec.whatwg.org/multipage/media.html#concept-media-load-algorithm
  // > If mode is object
  // > 1. Set the currentSrc attribute to the empty string.
  const { currentSrc } = originalElement;
  const isSrcObjectUsedOrNoSourceAtAll = !currentSrc;
  if (isSrcObjectUsedOrNoSourceAtAll) {
    const { srcObject } = originalElement;

    if (!srcObject) {
      if (IS_DEV_MODE) {
        console.warn('Making a clone element for an element with no source. You probably'
          + ' should have waited before the original element gets a source');
      }
      return cloneEl;
    }

    cloneEl.srcObject = srcObject;
  } else {
    cloneEl.src = currentSrc;
  }
  return cloneEl;
}
