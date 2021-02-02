/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const path = require('path');

module.exports = {
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
    SilenceDetectorProcessor: './src/content/SilenceDetectorProcessor.ts',
    VolumeFilter: './src/content/VolumeFilter.ts',

    popup: './src/popup/main.ts',
    background: './src/background/main.ts',
    options: './src/options/main.ts',

    'local-file-player': './src/local-file-player/main.ts',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: (pathData, assetInfo) => {
      const chunkName = pathData.chunk.name;
      if (['SilenceDetectorProcessor', 'VolumeFilter'].includes(chunkName)) {
        return `content/${chunkName}.js`;
      }
      return `${chunkName}/main.js`;
    },
    // Added this so 'popup/popup.html' can load chunks (which are located in 'dist/'). May want to instead move
    // 'popup.html' to 'dist/popup.html'.
    publicPath: '/',
  },

  plugins: [
    new CleanWebpackPlugin(),
    new CopyPlugin({
      patterns: [
        { context: 'src', from: 'manifest.json' },
        { context: 'src', from: 'icons/**' },
        { context: 'src', from: 'popup/*.(html|css)', to: 'popup/[name].[ext]' },
        { context: 'src', from: 'options/*.(html|css)', to: 'options/[name].[ext]' },
        { context: 'src', from: 'local-file-player/*.(html|css)', to: 'local-file-player/[name].[ext]' },
      ],
    }),
    new (require('webpack-bundle-analyzer').BundleAnalyzerPlugin)(),
  ],
};
