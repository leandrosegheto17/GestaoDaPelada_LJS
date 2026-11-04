import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { urlDoWorker } from './test/apoio/banco-worker.ts';

const raiz = join(import.meta.dirname, '../..');
// O Worker de teste recebe só o que o wrangler.jsonc e o miniflare declaram: o `.env` não vira segredo dele.
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
// Role de login só dos testes do Worker (membro de `pelada_app`): a senha é nova a cada execução.
process.env.WORKER_TESTE_SENHA ||= randomBytes(12).toString('hex');

const DATABASE_URL_TESTE =
  process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres';

// O Worker de teste serve `frontend/web/dist`. Com o build do web, vale o real; sem ele (antes da T43 ou num CI
// que só roda a API), uma pasta temporária com um index.html mínimo, para provar a SPA sem sujar o repositório.
const distReal = join(raiz, 'frontend/web/dist');
let assetsDir = distReal;
if (!existsSync(join(distReal, 'index.html'))) {
  assetsDir = mkdtempSync(join(tmpdir(), 'pelada-assets-'));
  writeFileSync(
    join(assetsDir, 'index.html'),
    '<!doctype html><html><body><div id="root"></div></body></html>',
  );
}
const INDEX_HTML = readFileSync(join(assetsDir, 'index.html'), 'utf8');

// O `exports.import` do pg-protocol aponta para um .js em ESM sem "type": "module", que o pool do workerd carrega como
// CommonJS e quebra. Aponta-se para a build CommonJS, a mesma que o `require` do pg usa.
const requireDoPg = createRequire(createRequire(import.meta.url).resolve('pg'));
const PG_PROTOCOL_CJS = requireDoPg.resolve('pg-protocol/dist/index.js');
const PG_CLOUDFLARE_CJS = join(
  dirname(requireDoPg.resolve('pg-cloudflare/package.json')),
  'dist',
  'index.js',
);

// Dois projetos: `node` (migrações, isolamento, config) e `workers` (rotas e middlewares no workerd).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^pg-protocol$/, replacement: PG_PROTOCOL_CJS },
      { find: /^pg-cloudflare$/, replacement: PG_CLOUDFLARE_CJS },
    ],
  },
  test: {
    // As roles são do cluster: migrar bancos em arquivos simultâneos disputaria o catálogo.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { DATABASE_URL_TESTE },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/rotas/**'],
        },
      },
      {
        extends: true,
        plugins: [
          cloudflareTest({
            wrangler: { configPath: '../../wrangler.jsonc' },
            miniflare: {
              assets: {
                directory: assetsDir,
                // Só no teste: o `exports.default.fetch` chama o Worker direto; o binding alcança os assets.
                binding: 'ASSETS',
                routerConfig: { invoke_user_worker_ahead_of_assets: false },
              },
              hyperdrives: {
                HYPERDRIVE: urlDoWorker(DATABASE_URL_TESTE, process.env.WORKER_TESTE_SENHA),
              },
              bindings: { INDEX_HTML_ESPERADO: INDEX_HTML },
            },
          }),
        ],
        test: {
          name: 'workers',
          include: ['test/rotas/**/*.test.ts'],
          globalSetup: ['./test/apoio/setup-worker.ts'],
        },
      },
    ],
  },
});
