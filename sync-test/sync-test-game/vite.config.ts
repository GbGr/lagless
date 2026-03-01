/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import wasm from 'vite-plugin-wasm';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/sync-test/sync-test-game',
  server: {
    port: 4201,
    host: true,
  },
  preview: {
    port: 4201,
    host: 'localhost',
  },
  resolve: {
    conditions: ['@lagless/source'],
  },
  plugins: [
    wasm(),
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
