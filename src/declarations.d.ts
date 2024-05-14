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

// https://github.com/tsconfig/bases#svelte-tsconfigjson
/// <reference types="svelte" />

declare module 'tippy.js/dist/tippy.css'; // Not sure if it's the best way to go about suppressing that error.

declare module 'webextension-polyfill' {
  export = browser;
}
declare const IS_DEV_MODE: boolean;
declare const BUILD_DEFINITIONS: {
  BROWSER: 'chromium' | 'gecko',
  BROWSER_MAY_HAVE_AUDIO_DESYNC_BUG: boolean,
  BROWSER_MAY_HAVE_EQUAL_OLD_AND_NEW_VALUE_IN_STORAGE_CHANGE_OBJECT: boolean,

  CONTACT_EMAIL: string,
}
declare module '{WEBEXTENSIONS_API_PATH}' {
  export = browser;
}
