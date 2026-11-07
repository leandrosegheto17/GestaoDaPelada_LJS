import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import { VERSAO_TESTE } from './test/rotas/constantes.ts';

// O `pg` chama `require('pg-protocol')`; no workerd do vitest a resolução usa a condição `import` e cai em
// `esm/index.js` (ESM sem `type: module`), que não carrega ("Cannot use import statement outside a module").
// Já o `pg-cloudflare` sem a condição `workerd` cai em `dist/empty.js` (sem `CloudflareSocket`). O plugin abaixo
// fixa o arquivo CommonJS certo de cada um.
const exigirDoPg = createRequire(createRequire(import.meta.url).resolve('pg'));
const posix = (caminho: string) => caminho.split(String.fromCharCode(92)).join('/');
const PG_PROTOCOL_CJS = posix(exigirDoPg.resolve('pg-protocol'));
const PG_CLOUDFLARE_REAL = posix(
  posix(exigirDoPg.resolve('pg-cloudflare/package.json')).replace(
    /package\.json$/,
    'dist/index.js',
  ),
);

// Cópia do `pg-cloudflare` que engole o fim normal do socket (ver `test/apoio/pg-cloudflare-teste.cjs`).
const PG_CLOUDFLARE_TESTE = posix(
  fileURLToPath(new URL('./test/apoio/pg-cloudflare-teste.cjs', import.meta.url)),
);

const URL_TESTE =
  process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';

// O miniflare recusa o `localConnectionString` sem senha do `wrangler.jsonc` versionado (FUN-04). Como no
// `pnpm dev`, a senha entra só aqui, pela variável do wrangler ou pela `PELADA_APP_SENHA`.
const HYPERDRIVE_TESTE =
  process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??
  `postgres://pelada_app:${encodeURIComponent(process.env.PELADA_APP_SENHA || 'sem-senha')}@127.0.0.1:5432/pelada`;

export default defineConfig({
  // O módulo de fallback do pool do Worker resolve `require` pelo servidor vite da raiz, não pelo do projeto:
  // o plugin precisa ficar aqui.
  plugins: [
    {
      name: 'pg-cjs-do-workerd',
      enforce: 'pre',
      resolveId(origem: string, importador?: string) {
        if (/(^|\/)pg-protocol$/.test(origem)) return PG_PROTOCOL_CJS;
        if (/(^|\/)pg-cloudflare$/.test(origem))
          return importador && posix(importador).startsWith(PG_CLOUDFLARE_TESTE)
            ? PG_CLOUDFLARE_REAL
            : PG_CLOUDFLARE_TESTE;
        return null;
      },
    },
  ],
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
              // O cluster de teste também vale dentro do workerd (process.env vem dos bindings): sem isto os testes do
              // Worker caem no 5432 padrão e disputam o banco de outra sessão.
              bindings: { VERSAO: VERSAO_TESTE, DATABASE_URL_TESTE: URL_TESTE },
              hyperdrives: { HYPERDRIVE: HYPERDRIVE_TESTE },
              assets: { directory: './test/rotas/spa' },
            },
          }),
        ],
        test: {
          name: 'worker',
          globalSetup: ['./test/apoio/molde-worker.ts'],
          include: ['test/rotas/**/*.test.ts', 'test/infraestrutura/push/**/*.test.ts'],
          // Matriz de plano e banco fora (conexão recusada) passam de 5 s no workerd do Windows.
          testTimeout: 30_000,
          // Clonar o molde em paralelo passa de 10 s com a máquina carregada (A-02, como o projeto `banco`).
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
