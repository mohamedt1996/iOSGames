import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  publicDir: '../shared-assets',
  build: { target: 'es2020', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
  server: { host: true },
});
