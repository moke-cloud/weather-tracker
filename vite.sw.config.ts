import { defineConfig } from 'vite'

/**
 * Service Worker 専用ビルド。
 * src/sw.ts と その import (weather-service / headache-model / db / notif-store 等) を
 * 1ファイル dist/sw.js に self-contained でバンドルする (classic worker, import 無し)。
 *
 * メインの `vite build` の後に emptyOutDir:false で追記する想定。
 */
export default defineConfig({
  base: '/weather-tracker/',
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2020',
    rollupOptions: {
      input: 'src/sw.ts',
      output: {
        entryFileNames: 'sw.js',
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
})
