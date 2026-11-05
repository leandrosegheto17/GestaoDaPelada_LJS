import { fileURLToPath } from 'node:url';
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
    // Duas páginas: o app e a página offline (FUN-35), que sai em dist/offline.html com o CSS do build.
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        offline: fileURLToPath(new URL('./offline.html', import.meta.url)),
      },
    },
  },
  // Build da comparação visual (T54): o nome da classe do CSS Module começa pela classe do
  // mockup (`faixa--erro--m-<hash>`), para o `recorte` do telas.json achar o elemento no app
  // (`e2e/ferramentas/telas-reais.mjs`, `seletorDoApp`). O build da prévia segue com o padrão.
  ...(process.env.VITE_VITRINE === '1'
    ? { css: { modules: { generateScopedName: '[local]--m-[hash:base64:5]' } } }
    : {}),
  server: {
    // pnpm dev (FUN-04) passa a porta do wrangler dev; padrão 8787.
    proxy: { '/api': `http://127.0.0.1:${process.env.PELADA_DEV_PORTA_API || '8787'}` },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    // T73 (P24): o localStorage do jsdom não passa de um teste para outro.
    setupFiles: ['test/apoio/limpar-armazenamento.ts'],
    // CSS Modules com os nomes do mockup, para os testes conferirem as classes.
    css: { include: [/\.module\.css$/], modules: { classNameStrategy: 'non-scoped' } },
  },
});
