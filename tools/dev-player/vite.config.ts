import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  root: __dirname,
  server: { port: 4210, host: true },
  preview: { port: 4210 },
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
