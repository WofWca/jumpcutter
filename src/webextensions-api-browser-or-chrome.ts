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

// This is for when `browser`'s and `chrome`'s utility have the same signature and behavior, in order to minimize
// the usage of 'webextension-polyfill' in Chromium.
// Currently we don't use the polyfill at all because after Manifest V3 the
// signatures are pretty compatible.
export const browserOrChrome = BUILD_DEFINITIONS.BROWSER === 'chromium'
  // Not just `chrome` because hopefully chromium will add `browser` and deprecate `chrome`
  ? (typeof browser !== 'undefined' ? browser : chrome)
  : browser;
