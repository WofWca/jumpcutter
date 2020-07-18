const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const path = require('path');

module.exports = {
  devtool: process.env.NODE_ENV === 'production'
    // TODO although we generate it, I haven't managed to apply it in Chrome dev tools. Maybe someone will, or it will
    // get fixed by itself. Why not 'inline-source-map' in prod? Because I believe it would increase parsing time.
    ? 'source-map'
    // The default one ('eval') doesn't work because "'unsafe-eval' is not an allowed source of script in the following
    // Content Security Policy directive:". This occurs when you try to open the popup.
    : 'inline-source-map',

  entry: {
    content: './src/content/main.js',
    popup: './src/popup.js',
    SilenceDetectorProcessor: './src/content/SilenceDetectorProcessor.js',
    VolumeFilter: './src/content/VolumeFilter.js',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },

  plugins: [
    new CleanWebpackPlugin(),
    new CopyPlugin({
      patterns: [
        { context: 'src', from: 'manifest.json' },
        { context: 'src', from: 'icons/**' },
        { context: 'src', from: '**/*.(html|css)' },
      ],
    }),
  ],

  optimization: {
    minimizer: [new TerserPlugin()],
  }
};
