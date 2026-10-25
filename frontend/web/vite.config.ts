import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, type Plugin } from 'vitest/config';
import { criarOpcoesPwa, lerCoresDoTema } from './config/manifesto.ts';
import { configuracaoServidor } from './configuracao-servidor.ts';

/** `theme-color` vem do token, sem repetir o valor no HTML-fonte. */
function corDoTema(): Plugin {
  return {
    name: 'cor-do-tema',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { name: 'theme-color', content: lerCoresDoTema().tema }, injectTo: 'head' },
    ],
  };
}

const emTeste = Boolean(process.env.VITEST);

export default defineConfig({
  plugins: [react(), corDoTema(), ...(emTeste ? [] : [VitePWA(criarOpcoesPwa())])],
  build: {
    outDir: 'dist',
    // A página offline é uma entrada própria: o CSS dela sai com hash e entra no precache junto com o shell.
    rollupOptions: { input: { index: 'index.html', offline: 'offline.html' } },
  },
  server: configuracaoServidor(process.env),
  test: {
    environment: 'jsdom',
    css: { include: /\.module\.css$|\.css\?raw$/ },
    setupFiles: ['./test/apoio/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,mjs}', 'e2e/**/*.test.mjs'],
  },
});
