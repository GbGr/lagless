import { defineConfig, PluginOption } from 'vite';
import swc from 'unplugin-swc';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/core',
  plugins: [
    swc.vite({
      swcrc: false,
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2017',
        loose: true,
        keepClassNames: true,
        externalHelpers: true,
      },
      module: { type: 'es6' },
      sourceMaps: true,
    }) as PluginOption,
  ],
  test: {
    name: '@lagless/core',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    setupFiles: ['./vitest.setup.ts'], // <— add this
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
