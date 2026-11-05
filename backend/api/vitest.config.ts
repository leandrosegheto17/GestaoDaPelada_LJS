import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import { VERSAO_TESTE } from './test/rotas/constantes.ts';

const URL_TESTE = process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';

export default defineConfig({
  test: {
    projects: [
      {
        // Banco, migrações e isolamento: Node, contra o Postgres local ou do CI.
        test: {
          name: 'banco',
          include: ['test/**/*.test.ts'],
          exclude: ['test/rotas/**'],
          env: { DATABASE_URL_TESTE: URL_TESTE },
          // As roles são do cluster: migrar bancos de teste em paralelo disputa o CREATE ROLE.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        // Rotas e middlewares: o Worker no workerd, com o wrangler.jsonc da raiz (FUN-20).
        // Os assets vêm de uma SPA de teste, porque o build do web nasce depois (T43); o build
        // real é provado pelo e2e (T58).
        plugins: [
          cloudflareTest({
            wrangler: { configPath: '../../wrangler.jsonc' },
            miniflare: {
              bindings: { VERSAO: VERSAO_TESTE },
              assets: { directory: './test/rotas/spa' },
            },
          }),
        ],
        test: {
          name: 'worker',
          include: ['test/rotas/**/*.test.ts'],
        },
      },
    ],
  },
});
