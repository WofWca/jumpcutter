const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: {
    content: './src/content.js',
    popup: './src/popup.js',
    SilenceDetectorProcessor: './src/SilenceDetectorProcessor.js',
    VolumeFilter: './src/VolumeFilter.js',
  },

  output: {
    filename: '[name].js'
  },

  plugins: [
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
