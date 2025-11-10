/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/circle-race/circle-race-game',
  server: {
    port: 4200,
    host: true
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [wasm(), topLevelAwait(), react()],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    exclude: [
      '@lagless/deterministic-math',
    ],
  }
}));
