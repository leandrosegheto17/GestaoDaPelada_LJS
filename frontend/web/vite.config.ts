import { defineConfig } from 'vitest/config';
import { configuracaoServidor } from './configuracao-servidor.ts';

// Plugins do React e do PWA entram com o front base (Fases 5 e 6).
export default defineConfig({
  build: { outDir: 'dist' },
  server: configuracaoServidor(process.env),
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
  },
});
