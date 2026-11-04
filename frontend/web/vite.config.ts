import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'jsdom',
    // CSS Modules sem hash nos testes: a classe é o nome escrito no arquivo.
    css: { include: [/\.module\.css$/], modules: { classNameStrategy: 'non-scoped' } },
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
  },
});
