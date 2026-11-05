import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Front (design C6): o build sai em `dist/`, servido pelo Worker como assets (wrangler.jsonc).
 * Em dev, `/api` vai para o wrangler dev local.
 */
export default defineConfig({
  plugins: [react()],
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
  },
});
