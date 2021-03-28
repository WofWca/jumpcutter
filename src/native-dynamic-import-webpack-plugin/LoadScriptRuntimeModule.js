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