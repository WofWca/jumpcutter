/**
 * @license
 * Copyright (C) 2020, 2021, 2022, 2023  WofWca <wofwca@protonmail.com>
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

/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */
const webpack = require('webpack');
const fs = require('fs/promises');
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const path = require('path');
const NativeDynamicImportPlugin = require('./src/native-dynamic-import-webpack-plugin/main.js');
const { minimizeJsonString: minimizeI18nMessagedJsonString } = require('minimize-webext-i18n-json');

module.exports = env => {
  if (!env.browser) {
    // TODO chore: would be cool if we could perform `BUILD_DEFINITIONS.BROWSER` checks at runtime in development mode, so you
    // don't have run a different command to test something in a different browser.
    // For example, we could define `BUILD_DEFINITIONS.BROWSER`  as some  browser detection code instead of
    // `JSON.stringify(env.browser)`.
    throw new Error('You must define the `browser` environment variable (`--env browser=chromium`');
  }
  const definePlugin = new webpack.DefinePlugin({
    'IS_DEV_MODE': JSON.stringify(process.env.NODE_ENV !== 'production'),
    'BUILD_DEFINITIONS.BROWSER': JSON.stringify(env.browser),
    'BUILD_DEFINITIONS.BROWSER_MAY_HAVE_AUDIO_DESYNC_BUG': JSON.stringify(env.browser === 'chromium'),
    'BUILD_DEFINITIONS.BROWSER_MAY_HAVE_EQUAL_OLD_AND_NEW_VALUE_IN_STORAGE_CHANGE_OBJECT':
      JSON.stringify(env.browser !== 'chromium'),
  });

  return {
    devtool: process.env.NODE_ENV === 'production'
      ? undefined
      // The default one ('eval') doesn't work because "'unsafe-eval' is not an allowed source of script in the following
      // Content Security Policy directive:". This occurs when you try to open the popup.
      : 'inline-source-map',

    // Taken from https://github.com/sveltejs/svelte-loader#usage
    resolve: {
      alias: {
        svelte: path.resolve('node_modules', 'svelte'),
        '@': path.resolve(__dirname, 'src'),
      },
      extensions: ['.tsx', '.ts', '.mjs', '.js', '.svelte', '.json'],
      mainFields: ['svelte', 'browser', 'module', 'main'],
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.(html|svelte)$/,
          // exclude: /node_modules/, // Not sure if we need this.
          use: {
            loader: 'svelte-loader',
            options: {
              preprocess: require('svelte-preprocess')(),
              compilerOptions: {
                dev: process.env.NODE_ENV !== 'production',
              },
              // TODO perf: `emitCss: true`, `ExtractTextPlugin`?
              // https://github.com/sveltejs/svelte-loader#usage
              hotReload: process.env.NODE_ENV !== 'production',
            },
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },

    entry: {
      content: './src/entry-points/content/main.ts',
      // Yes, the following are also entry points, but I'm not convinced they should be put in a
      // separate `./src/entry-points/*` directory.
      'cloneMediaSources-for-extension-world':
        './src/entry-points/content/cloneMediaSources/main-for-extension-world.ts',
      'cloneMediaSources-for-page-world':
        './src/entry-points/content/cloneMediaSources/main-for-page-world.ts',
      SilenceDetectorProcessor: './src/entry-points/content/SilenceDetector/SilenceDetectorProcessor.ts',
      VolumeFilterProcessor: './src/entry-points/content/VolumeFilter/VolumeFilterProcessor.ts',

      popup: './src/entry-points/popup/main.ts',
      background: './src/entry-points/background/main.ts',
      options: './src/entry-points/options/main.ts',

      'local-file-player': './src/entry-points/local-file-player/main.ts',
    },

    output: {
      path: path.resolve(__dirname, `dist-${env.browser}`),
      filename: (pathData, assetInfo) => {
        const chunkName = pathData.chunk.name;
        if (
          [
            'cloneMediaSources-for-extension-world',
            'cloneMediaSources-for-page-world',
            'SilenceDetectorProcessor',
            'VolumeFilterProcessor'
          ].includes(chunkName)
        ) {
          return `content/${chunkName}.js`;
        }
        return `${chunkName}/main.js`;
      },
      // Paths are transformed with `browser.runtime.getURL()` in `NativeDynamicImportPlugin`.
      publicPath: '/',
      // So we don't have to add too much to `web_accessible_resources` (`*.js`) (however I'm not sure if that would
      // be bad).
      chunkFilename: 'chunks/[id].js',
    },

    plugins: [
      new CleanWebpackPlugin(),
      definePlugin,
      new webpack.NormalModuleReplacementPlugin(
        /^\{WEBEXTENSIONS_API_PATH\}$/,
        resource => {
          // This is so the polyfill is not included in builds for browsers that support it natively, for better
          // performance. The polyfill is said to act as a no-op in such browsers, so it can be safely removed:
          // https://github.com/mozilla/webextension-polyfill/blob/614a1f3f36ca8666ecf1e26ee828a5dd1e0e04c2/README.md#supported-browsers
          resource.request = env.browser === 'gecko'
            ? '@/webextensions-api-native.ts'
            : '@/webextensions-api-polyfill.ts'
        },
      ),
      // This is so dynamic import works in content scripts (but it affects all scripts).
      // TODO refactor: replace with `output.environment.dynamicImport = true` (which will act as
      // `output.chunkLoading = 'import'`). But doing `browser.runtime.getURL()` (in
      // src/native-dynamic-import-webpack-plugin/LoadScriptRuntimeModule.js:19) appears to still be required.
      // Maybe we can somehow utilize Webpack's `publicPath` option to solve this?
      new NativeDynamicImportPlugin(),

      new CopyPlugin({
        patterns: [
          {
            context: 'src',
            from: 'manifest.json',
            // Compress JSON. Might want to switch to https://webpack.js.org/plugins/json-minimizer-webpack-plugin/
            // later.
            transform: (content) => JSON.stringify(JSON.parse(content)),
          },

          {
            context: 'src',
            from: `_locales/*/messages.json`,
            // Filter out locales with empty `messages.json` files
            filter: async (resourcePath) => {
              const content = await fs.readFile(resourcePath, { encoding: 'utf-8' });
              const obj = JSON.parse(content);
              if (Object.keys(obj).length === 0) {
                return false;
              }
              return true;
            },
            transform: (content) => minimizeI18nMessagedJsonString(content, { unsafe: false }),
          },
          // Chromium apparently refuses to display the extension in 'nb_NO', if you make 'nb'
          // the browser's UI language. Let's do this to make it satisfied, while also keeping
          // the original 'nb_NO' directory intact for forwards-compatibility.
          // https://developer.chrome.com/docs/webstore/i18n/#choosing-locales-to-support
          // TODO file a bug? Or is it the way it should work?
          ...(
            env.browser === 'chromium'
              ? [
                {
                  context: 'src',
                  from: `_locales/nb_NO/messages.json`,
                  to: `_locales/nb/messages.json`,
                  transform: (content) => minimizeI18nMessagedJsonString(content, { unsafe: false }),
                },
                // And same for Chinese. It won't recognize `zh_Hans` and only accepts `zh` or `zh_CN` (or `zh_TW`).
                {
                  context: 'src',
                  from: `_locales/zh_Hans/messages.json`,
                  to: `_locales/zh_CN/messages.json`,
                  transform: (content) => minimizeI18nMessagedJsonString(content, { unsafe: false }),
                },
                {
                  context: 'src',
                  from: `_locales/zh_Hant/messages.json`,
                  to: `_locales/zh_TW/messages.json`,
                  transform: (content) => minimizeI18nMessagedJsonString(content, { unsafe: false }),
                },
              ]
              : []
          ),

          { context: 'src', from: '_locales/LICENSE_NOTICES', to: '_locales' },
          { from: 'COPYING' },
          { context: 'src/entry-points', from: 'license.html' },
          { from: 'docs/agplv3-with-text-162x68.png', to: '.' },
          { context: 'src', from: 'icons/(icon.svg|icon-disabled.svg|icon-only-sounded.svg|icon.svg-64.png|icon-big-padded.svg-128.png)' },
          { context: 'src/entry-points', from: 'popup/*.(html|css)', to: 'popup/[name][ext]' },
          { context: 'src/entry-points', from: 'options/*.(html|css)', to: 'options/[name][ext]' },
          { context: 'src/entry-points', from: 'local-file-player/*.(html|css)', to: 'local-file-player/[name][ext]' },
        ],
      }),
      new (require('webpack-bundle-analyzer').BundleAnalyzerPlugin)({
        analyzerMode: env.noreport ? 'disabled' : 'server',
      }),
    ],

    optimization: {
      splitChunks: {
        // Optimize for the fact that chunks are loaded from disk, not from network.
        // No research behind the number, just intuition.
        minSize: 100,
      },
    }
  };
}
