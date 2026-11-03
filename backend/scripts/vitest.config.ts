import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL_TESTE:
        process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
    },
  },
});
