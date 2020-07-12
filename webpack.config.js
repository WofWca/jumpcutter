const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: {
    content: './src/content.js',
    popup: './src/popup.js',
  },

  output: {
    filename: '[name].js'
  },

  optimization: {
    minimizer: [new TerserPlugin()],
  }
};
