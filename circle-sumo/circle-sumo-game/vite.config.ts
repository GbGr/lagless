/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import wasm from 'vite-plugin-wasm';
import svgr from 'vite-plugin-svgr';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/circle-sumo/circle-sumo-frontend',
  server: {
    port: 4200,
    host: true,
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  resolve: {
    conditions: ['@lagless/source'],
  },
  plugins: [
    wasm(),
    topLevelAwait(),
    svgr(),
    react({
      tsDecorators: true,
      useAtYourOwnRisk_mutateSwcOptions: (options) => {
        options.jsc!.transform!.decoratorMetadata = true;
      },
    }),
  ],
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
    exclude: ['@lagless/deterministic-math'],
  },
}));
