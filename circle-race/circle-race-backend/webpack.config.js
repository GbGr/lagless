const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack');

module.exports = {
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  output: {
    path: join(__dirname, 'dist'),
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMaps: true,
    }),
    new webpack.IgnorePlugin({
      resourceRegExp:
        /^(@colyseus\/bun-websockets|request-logs|bufferutil|utf-8-validate|@hapi\/hapi\/package\.json|hapi\/package\.json)$/
    }),
  ],

  externalsPresets: { node: true },
  externals: [
    nodeExternals(),
  ],
};
