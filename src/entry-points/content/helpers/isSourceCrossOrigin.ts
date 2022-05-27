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

export function isSourceCrossOrigin(el: HTMLMediaElement): boolean {
  // `el.currentSrc` may be empty even if the media is playing when `el.srcObject` is used instead of `el.src`,
  // or if the element got inserted befiore it got assigned `src`.
  // TODO research whether it can still be cross-origin in this case.
  // TODO yes, if a request to `el.currentSrc` returns a redirect to another origin. This happens with
  // Invidious: https://yewtu.be/watch?v=jNQXAC9IVRw.
  let elCurrentSrcUrl: URL;
  try {
    elCurrentSrcUrl = new URL(el.currentSrc);
  } catch (e) {
    if (!(e instanceof TypeError)) {
      throw e;
    }
    // I don't know if this could be incorrect, but it's good enough for our case.
    return false;
  }
  return elCurrentSrcUrl.origin !== document.location.origin;
}
