import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Local: as URLs dos bancos de teste vêm do `.env` da raiz (fora do git). No CI, do ambiente do job.
const ENV = join(import.meta.dirname, '../../.env');
if (existsSync(ENV)) process.loadEnvFile(ENV);
// O Worker de teste recebe só o que o wrangler.jsonc e o miniflare declaram: o `.env` não vira segredo dele.
process.env['CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV'] = 'false';

// O Worker de teste declara `assets`; a pasta precisa existir mesmo sem o build do web.
mkdirSync(join(import.meta.dirname, '../../frontend/web/dist'), { recursive: true });

// Sem banco de teste configurado, o binding aponta para um endereço local qualquer: só os testes que consultam falham.
const BANCO_DO_WORKER = process.env['DATABASE_URL_TESTE'] ?? 'postgres://postgres:postgres@localhost:5432/pelada_teste';

// Dois projetos: `node` (migrations, isolamento, scripts e config) e `workers` (rotas e middlewares no workerd).
export default defineConfig({
  test: {
    // As roles são do servidor inteiro (não do banco): migrar dois bancos ao mesmo tempo disputaria o catálogo.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: { name: 'node', include: ['test/**/*.test.ts'], exclude: ['test/rotas/**'] },
      },
      {
        extends: true,
        plugins: [
          cloudflareTest({
            wrangler: { configPath: '../../wrangler.jsonc' },
            miniflare: { hyperdrives: { HYPERDRIVE: BANCO_DO_WORKER } },
          }),
        ],
        test: { name: 'workers', include: ['test/rotas/**/*.test.ts'] },
      },
    ],
  },
});
