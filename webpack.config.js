const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')
const HtmlMinimizerPlugin = require('html-minimizer-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')

module.exports = {
  mode: 'production',
  entry: './src/js/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    filename: 'js/main.js',
  },
  module: {
    rules: [
      {
        test: /\.html$/i,
        type: 'asset/resource',
      },
      {
        test: /.s?css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: '**/*"', context: 'src/' },
        { from: '.', to: './assets', context: 'assets' },
      ],
    }),
    new MiniCssExtractPlugin(),
  ],
  optimization: {
    minimize: true,
    minimizer: [new CssMinimizerPlugin(), new HtmlMinimizerPlugin()],
  },
}
