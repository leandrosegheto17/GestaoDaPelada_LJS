import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import { VERSAO_TESTE } from './test/rotas/constantes.ts';

const URL_TESTE =
  process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';

// O miniflare recusa o `localConnectionString` sem senha do `wrangler.jsonc` versionado (FUN-04). Como no
// `pnpm dev`, a senha entra só aqui, pela variável do wrangler ou pela `PELADA_APP_SENHA`.
const HYPERDRIVE_TESTE =
  process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??
  `postgres://pelada_app:${encodeURIComponent(process.env.PELADA_APP_SENHA || 'sem-senha')}@127.0.0.1:5432/pelada`;

export default defineConfig({
  test: {
    projects: [
      {
        // Banco, migrações e isolamento: Node, contra o Postgres local ou do CI.
        test: {
          name: 'banco',
          include: ['test/**/*.test.ts'],
          // A cifra e o VAPID do push rodam no workerd: é lá que a P-256 precisa funcionar (AD-100).
          exclude: ['test/rotas/**', 'test/infraestrutura/push/**'],
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
              hyperdrives: { HYPERDRIVE: HYPERDRIVE_TESTE },
              assets: { directory: './test/rotas/spa' },
            },
          }),
        ],
        test: {
          name: 'worker',
          include: ['test/rotas/**/*.test.ts', 'test/infraestrutura/push/**/*.test.ts'],
        },
      },
    ],
  },
});
