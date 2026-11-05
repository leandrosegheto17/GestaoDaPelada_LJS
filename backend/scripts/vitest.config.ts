import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'ops/test/**/*.test.ts', 'checagens/test/**/*.test.ts'],
    env: {
      DATABASE_URL_TESTE:
        process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada',
    },
    // As roles são do cluster: bancos de teste migrados em paralelo disputam o CREATE ROLE.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
