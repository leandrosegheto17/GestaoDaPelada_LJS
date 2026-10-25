import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { configuracaoServidor } from './configuracao-servidor.ts';

// O plugin do PWA entra com o shell PWA (Fase 6).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: configuracaoServidor(process.env),
  test: {
    environment: 'jsdom',
    css: { include: /\.module\.css$|\.css\?raw$/ },
    setupFiles: ['./test/apoio/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,mjs}'],
  },
});
