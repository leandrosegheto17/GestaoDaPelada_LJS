import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, type Plugin } from 'vitest/config';
import { manifesto } from './src/config/manifesto.ts';

/** Publica `tokens.css` na raiz do build para a página offline (estática) usar as mesmas variáveis do app. */
function publicarTokens(): Plugin {
  return {
    name: 'pelada:publicar-tokens',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'tokens.css',
        source: readFileSync(join(import.meta.dirname, 'src', 'estilos', 'tokens.css'), 'utf8'),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    publicarTokens(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      manifest: manifesto,
      manifestFilename: 'manifest.webmanifest',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
        globIgnores: ['**/*.map'],
      },
    }),
  ],
  // `pnpm dev`: o Worker (wrangler dev) serve /api/*; o Vite encaminha para ele (FUN-04).
  server: {
    proxy: { '/api': `http://127.0.0.1:${process.env.PELADA_DEV_PORTA_API || '8787'}` },
  },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'jsdom',
    // CSS Modules sem hash nos testes: a classe é o nome escrito no arquivo.
    css: { include: [/\.module\.css$/], modules: { classNameStrategy: 'non-scoped' } },
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
  },
});
