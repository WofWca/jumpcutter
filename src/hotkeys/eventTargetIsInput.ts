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

/**
 * If a key is pressed while typing in an input field, we don't consider this a hotkey.
 * Filter criteria is yoinked from
 * https://github.com/ccampbell/mousetrap/blob/2f9a476ba6158ba69763e4fcf914966cc72ef433/mousetrap.js#L1000
 * and alike libraries. Another reason to rewrite all this using a library.
 * 
 * TODO how about we also/instead check if the target element is a parent of the video element that we're controlling?
 */
export function eventTargetIsInput(event: KeyboardEvent): boolean {
  const t = event.target as Document | HTMLElement;
  return (
    ['INPUT', 'SELECT', 'TEXTAREA']
      // @ts-expect-error 2339 for performance because doing `'tagName' in t` would be redundant, because
      // it is present most of the time.
      .includes(t.tagName)
    // @ts-expect-error 2339 same as above
    || t.isContentEditable
  );
}
