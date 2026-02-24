/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/gravity-pong/gravity-pong-game',
  server: {
    port: 4202,
    host: true,
  },
  preview: {
    port: 4202,
    host: 'localhost',
  },
  resolve: {
    conditions: ['@lagless/source'],
  },
  plugins: [
    wasm(),
    topLevelAwait(),
    react({
      tsDecorators: true,
      useAtYourOwnRisk_mutateSwcOptions: (options) => {
        options.jsc!.transform!.decoratorMetadata = true;
      },
    }),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    exclude: ['@lagless/deterministic-math'],
  },
}));
