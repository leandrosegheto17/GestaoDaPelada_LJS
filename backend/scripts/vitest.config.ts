import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'ops/test/**/*.test.ts'],
    env: {
      DATABASE_URL_TESTE:
        process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada',
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
