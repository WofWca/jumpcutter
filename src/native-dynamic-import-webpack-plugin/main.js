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

// This plugin is inspired by https://github.com/crimx/webpack-target-webextension
// Why not use that plugin? Because in content scripts it uses `tabs.runtime.executeScript` (not `import()`),
// which requires the extension to have 'activeTab' or host permission, and it's good to require as little permissions
// as possible.

/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */
const RuntimeGlobals = require('webpack/lib/RuntimeGlobals')
const LoadScriptRuntimeModule = require('./LoadScriptRuntimeModule')

module.exports = class NativeDynamicImportPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap(NativeDynamicImportPlugin.name, (compilation) => {
      compilation.hooks.runtimeRequirementInTree
        .for(RuntimeGlobals.loadScript)
        .tap(NativeDynamicImportPlugin.name, (chunk, set) => {
          compilation.addRuntimeModule(chunk, new LoadScriptRuntimeModule())
          return true
        })
    })
  }
}