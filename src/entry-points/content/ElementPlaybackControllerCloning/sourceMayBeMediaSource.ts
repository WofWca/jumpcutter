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
 * @returns `true` if there is a non-zero (up to 100% inclusive) chance that the
 * source of `element` is a `MediaSource`.
 *   If the source is known to be a `MediaSourceHandle`, `false` is returned.
 */
export function sourceMayBeMediaSource(element: HTMLMediaElement): boolean {
  // Also see {@link `createCloneElementWithSameSrc`}. It is very similar.
  // Maybe even too similar.

  // https://html.spec.whatwg.org/multipage/media.html#concept-media-load-algorithm
  // > If mode is object
  // > 1. Set the currentSrc attribute to the empty string.
  const { currentSrc } = element;
  const isSrcObjectUsedOrNoSourceAtAll = !currentSrc;
  if (isSrcObjectUsedOrNoSourceAtAll) {
    const { srcObject } = element;
    if (!srcObject) {
      return false;
    }
    if (srcObject instanceof MediaSource) {
      return true;
    }
    return false;
  } else {
    // URLs returned by `createObjectURL` are guaranteed to `.startsWith('blob:')`:
    // https://w3c.github.io/FileAPI/#unicodeBlobURL
    if (!currentSrc.startsWith('blob:')) {
      // Just a regular src, like `https://example.com/bbb.mp4`.
      // Hold up, but is `URL.createObjectURL` the only way to create a URL from a `MediaSource`?
      return false;
    }
    // At this point we know that `currentSrc` is a `blob:` URL, which, with the current web spec,
    //  may be a `Blob` (including `File`), or `MediaSource`:
    // https://w3c.github.io/FileAPI/#blob-url-entry
    //
    // We could try to further determine if it's `Blob` or `MediaSource` by fetching the URL.
    // Based on my testing, fetching fails for `MediaSource` and succeeds for `Blob` and `File`.
    // But I'm not sure if this failure is a reliable way to test for it, I haven't found
    // this being said in the spec. Maybe one day they decide to make `fetch` succeed for
    // `MediaSource`.
    // Also, if you look at the context of where this function is used, it's good enough the
    // way it is now, because this function is only called when we're unable to play the source,
    // which most likely indicates that it's a `MediaSource`. But it could simply be that the
    // `Blob` data is not valid media data.
    return true;
  }
}
