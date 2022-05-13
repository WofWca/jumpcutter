/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const path = require('path');
const NativeDynamicImportPlugin = require('./src/native-dynamic-import-webpack-plugin/main.js');
const { minimizeJsonString } = require('minimize-webext-i18n-json');

const includeLanguages = [
  'en',
  'ru',
  'uk',
  'fr',
  'nb_NO',
  'es',
  // TODO check the other ones and add.
]

module.exports = env => {
  if (!env.browser) {
    // TODO would be cool if we could perform `BUILD_DEFINITIONS.BROWSER` checks at runtime in development mode, so you
    // don't have run a different command to test something in a different browser.
    // For example, we could define `BUILD_DEFINITIONS.BROWSER`  as some  browser detection code instead of
    // `JSON.stringify(env.browser)`.
    throw new Error('You must define the `browser` environment variable (`--env browser=chromium`');
  }
  const definePlugin = new webpack.DefinePlugin({
    'BUILD_DEFINITIONS.BROWSER': JSON.stringify(env.browser),
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
              // TODO `emitCss: true`, `ExtractTextPlugin`?
              // https://github.com/sveltejs/svelte-loader#usage
              hotReload: true,
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
      content: './src/content/main.ts',
      SilenceDetectorProcessor: './src/content/SilenceDetector/SilenceDetectorProcessor.ts',
      VolumeFilterProcessor: './src/content/VolumeFilter/VolumeFilterProcessor.ts',

      popup: './src/popup/main.ts',
      background: './src/background/main.ts',
      options: './src/options/main.ts',

      'local-file-player': './src/local-file-player/main.ts',
    },

    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: (pathData, assetInfo) => {
        const chunkName = pathData.chunk.name;
        if (['SilenceDetectorProcessor', 'VolumeFilterProcessor'].includes(chunkName)) {
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
      // TODO replace with `output.environment.dynamicImport = true` (which will act as
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
            from: `_locales/(${includeLanguages.join('|')})/messages.json`,
            transform: (content) => minimizeJsonString(content, { unsafe: false }),
          },
          // Chromium apparently refuses to display the extension in 'nb_NO', if you make 'nb'
          // the browser's UI language. Let's do this to make it satisfied, while also keeping
          // the original 'nb_NO' directory intact for forwards-compatibility. TODO file a bug? Or
          // is it the way it should work?
          ...(
            env.browser === 'chromium' && includeLanguages.includes('nb_NO')
              ? [{
                context: 'src',
                from: `_locales/nb_NO/messages.json`,
                to: `_locales/nb/messages.json`,
                transform: (content) => minimizeJsonString(content, { unsafe: false }),
              }]
              : []
          ),

          { context: 'src', from: '_locales/(LICENSE_NOTICES|COPYING|COPYING.LESSER|index.html)' },
          { context: 'src', from: 'icons/(icon.svg|icon-disabled.svg|icon-only-sounded.svg|icon.svg-64.png|icon-big-padded.svg-128.png)' },
          { context: 'src', from: 'popup/*.(html|css)', to: 'popup/[name][ext]' },
          { context: 'src', from: 'options/*.(html|css)', to: 'options/[name][ext]' },
          { context: 'src', from: 'local-file-player/*.(html|css)', to: 'local-file-player/[name][ext]' },
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
