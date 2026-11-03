import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes de banco dividem o cluster (roles são do servidor, não do banco): um arquivo por vez.
    fileParallelism: false,
    env: {
      DATABASE_URL_TESTE:
        process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
    },
  },
});
