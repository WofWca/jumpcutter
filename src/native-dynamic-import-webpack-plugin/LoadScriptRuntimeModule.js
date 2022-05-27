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

// Mostly the same as
// https://github.com/webpack/webpack/blob/d64227af29e2b37ffddfffe97bb1abff964d0dd5/lib/runtime/LoadScriptRuntimeModule.js

/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */
const RuntimeGlobals = require('webpack/lib/RuntimeGlobals')
const Template = require('webpack/lib/Template')
const HelperRuntimeModule = require('webpack/lib/runtime/HelperRuntimeModule')

class LoadScriptRuntimeModule extends HelperRuntimeModule {
  constructor() {
    super('load script')
  }
  generate() {
    return Template.asString([
      `const nativeLoader = ` +
      this.compilation.runtimeTemplate.basicFunction('url, done, chunkId', [
        // In Chromium it's fine to use just a relative URL, but not in Gecko. Also let's just play it safe.
        `const urlAbsolute = (typeof browser === 'undefined' ? chrome : browser).runtime.getURL(url)`,
        `import(urlAbsolute).finally(done)`,
      ]),
      `${RuntimeGlobals.loadScript} = nativeLoader`,
    ])
  }
}

module.exports = LoadScriptRuntimeModule