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