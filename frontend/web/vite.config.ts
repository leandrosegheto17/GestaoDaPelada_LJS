import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { manifesto } from './src/config/manifesto.ts';

/**
 * Front (design C6): o build sai em `dist/`, servido pelo Worker como assets (wrangler.jsonc).
 * Em dev, `/api` vai para o wrangler dev local.
 *
 * PWA (FUN-33, FUN-34): `vite-plugin-pwa` em `injectManifest`. O service worker é o
 * `src/pwa/sw.ts`, e o manifest vem de `src/config/manifesto.ts`.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: manifesto,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    // CSS Modules com os nomes do mockup, para os testes conferirem as classes.
    css: { include: [/\.module\.css$/], modules: { classNameStrategy: 'non-scoped' } },
  },
});
