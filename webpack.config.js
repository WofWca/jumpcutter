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
    // The bug is fixed in Chromium 128,
    // but let's support older versions for a while.
    // https://issues.chromium.org/issues/40190553#comment20
    'BUILD_DEFINITIONS.BROWSER_MAY_HAVE_AUDIO_DESYNC_BUG': JSON.stringify(env.browser === 'chromium'),
    'BUILD_DEFINITIONS.BROWSER_MAY_HAVE_EQUAL_OLD_AND_NEW_VALUE_IN_STORAGE_CHANGE_OBJECT':
      JSON.stringify(env.browser !== 'chromium'),

    'BUILD_DEFINITIONS.CONTACT_EMAIL':
      JSON.stringify('wofwca@protonmail.com'),
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
        svelte: path.resolve('node_modules', 'svelte/src/runtime'),
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
        // From https://github.com/sveltejs/svelte-loader#usage
        {
          test: /node_modules\/svelte\/.*\.mjs$/,
          resolve: {
            fullySpecified: false
          }
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
            from: 'manifest_base.json',
            to: 'manifest.json',
            transform: (content) => {
              const parsed = JSON.parse(content);
              injectBrowserSpecificManifestFields(parsed, env.browser)
              // Compressed JSON. Might want to switch to
              // https://webpack.js.org/plugins/json-minimizer-webpack-plugin/
              // later.
              return JSON.stringify(parsed)
            }
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
          // https://developer.chrome.com/docs/extensions/reference/api/i18n#supported-locales
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
          { context: 'src', from: 'icons/(icon.svg-64.png|icon-disabled.svg-64.png|icon-only-sounded.svg-64.png|icon.svg-128.png|icon-disabled.svg-128.png|icon-only-sounded.svg-128.png|icon-big-padded.svg-128.png)' },
          { context: 'src/entry-points', from: 'popup/*.(html|css)', to: 'popup/[name][ext]' },
          { context: 'src/entry-points', from: 'options/*.(html|css)', to: 'options/[name][ext]' },
          { context: 'src/entry-points', from: 'local-file-player/*.(html|css)', to: 'local-file-player/[name][ext]' },
          { context: 'src', from: 'imgs/*', to: 'imgs/[name][ext]'},
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

/**
 * @param {"chromium" | "gecko"} browser
 * @returns {void}
 */
function injectBrowserSpecificManifestFields(manifest, browser) {
  if (browser === "chromium") {
    manifest.background = {
      service_worker: "background/main.js",
    };
  } else if (browser === "gecko") {
    manifest.background = {
      scripts: ["background/main.js"],
    };
    manifest.browser_specific_settings = {
      gecko: {
        id: "jump-cutter@example.com",
        // At least "91.0a1" is required due to this bug:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1517199
        // "109" is required due to Manifest V3 migration:
        // https://extensionworkshop.com/documentation/publish/distribute-manifest-versions/
        // Also there are some issues on versions < "128",
        // see comments in `background/main.ts`.
        strict_min_version: "109.0",
      },
      // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings#firefox_gecko_properties
      gecko_android: {},
    };
  }
}
