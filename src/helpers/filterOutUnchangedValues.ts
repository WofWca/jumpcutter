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

import isEqual from 'lodash/isEqual';

/**
 * `browser.storage.onChanged` listeners in Firefox may be called with `newValue` equal to `oldValue` if you call
 * `storage.set()` with the same value. It's supposed to be used on all `browser.storage.onChanged.addListener`
 * callbacks.
 * https://bugzilla.mozilla.org/show_bug.cgi?id=1621162
 * If this really isn't a bug, rethink the whole commit, we may improve
 * performance, at least by using something other than `_.isEqual` as it covers a lot of edge cases (like regex types,
 * which we don't use).
 * @return a shallow clone with unchanged value keys deleted.
 */
export function filterOutUnchangedValues(
  changes: Record<string, browser.storage.StorageChange>
): Record<string, browser.storage.StorageChange> {
  if (IS_DEV_MODE) {
    if (!BUILD_DEFINITIONS.BROWSER_MAY_HAVE_EQUAL_OLD_AND_NEW_VALUE_IN_STORAGE_CHANGE_OBJECT) {
      console.warn('It is redundant to use this function in Chromium');
    }
  }

  const clone: typeof changes = {};
  for (const [_k, v] of Object.entries(changes)) {
    const k = _k as keyof typeof clone;
    const { newValue, oldValue } = v;
    if (!isEqual(newValue, oldValue)) {
      clone[k] = v;
    }
  }
  return clone;
}
