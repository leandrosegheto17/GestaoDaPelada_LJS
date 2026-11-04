import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const raiz = join(import.meta.dirname, '../..');
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

// Dois projetos: `node` (migrações, isolamento, config) e `workers` (rotas e middlewares no workerd).
export default defineConfig({
  test: {
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
              // O miniflare exige senha na string. Esta é fictícia: as rotas desta etapa não tocam o banco.
              hyperdrives: {
                HYPERDRIVE: 'postgres://pelada_app:senha-ficticia@127.0.0.1:5432/pelada',
              },
              bindings: { INDEX_HTML_ESPERADO: INDEX_HTML },
            },
          }),
        ],
        test: {
          name: 'workers',
          include: ['test/rotas/**/*.test.ts'],
        },
      },
    ],
  },
});
