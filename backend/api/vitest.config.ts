import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { urlDoOwnerDoWorker, urlDoWorker } from './test/apoio/banco-worker.ts';

// Local: as URLs dos bancos de teste vêm do `.env` da raiz (fora do git). No CI, do ambiente do job.
const ENV = join(import.meta.dirname, '../../.env');
if (existsSync(ENV)) process.loadEnvFile(ENV);
// O Worker de teste recebe só o que o wrangler.jsonc e o miniflare declaram: o `.env` não vira segredo dele.
process.env['CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV'] = 'false';

// O Worker de teste declara `assets`; a pasta precisa existir mesmo sem o build do web.
mkdirSync(join(import.meta.dirname, '../../frontend/web/dist'), { recursive: true });

// A senha de login de pelada_app é do servidor inteiro: local, a do `.env` (a mesma do `pnpm dev`); no CI, uma
// aleatória por execução. Fica no ambiente para o seed, o setup do Worker e o Hyperdrive usarem a mesma.
process.env['PELADA_APP_SENHA'] ||= randomBytes(12).toString('hex');
// Sem banco de teste configurado, o setup do Worker falha dizendo o que fazer.
const HYPERDRIVE_DE_TESTE = urlDoWorker(
  process.env['DATABASE_URL_TESTE'] ?? 'postgres://postgres:postgres@localhost:5432/pelada_teste',
  process.env['PELADA_APP_SENHA'],
);

// Só os testes de rota usam: leem o que a pelada_app não lê (a auditoria, ACE-46).
const OWNER_DE_TESTE = urlDoOwnerDoWorker(
  process.env['DATABASE_URL_TESTE'] ?? 'postgres://postgres:postgres@localhost:5432/pelada_teste',
);

// O `exports.import` do pg-protocol aponta para um .js em ESM sem "type": "module", que o pool de workers carrega
// como CommonJS e quebra. Aponta-se para a build CommonJS, a mesma que o `require` do pg usa (como no legado).
const requireDoPg = createRequire(createRequire(import.meta.url).resolve('pg'));
const PG_PROTOCOL_CJS = requireDoPg.resolve('pg-protocol/dist/index.js');
const PG_CLOUDFLARE_CJS = join(dirname(requireDoPg.resolve('pg-cloudflare/package.json')), 'dist', 'index.js');

// Dois projetos: `node` (migrations, isolamento, scripts e config) e `workers` (rotas e middlewares no workerd).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^pg-protocol$/, replacement: PG_PROTOCOL_CJS },
      { find: /^pg-cloudflare$/, replacement: PG_CLOUDFLARE_CJS },
    ],
  },
  test: {
    // As roles são do servidor inteiro (não do banco): migrar dois bancos ao mesmo tempo disputaria o catálogo.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/rotas/**'],
          // Roda antes do Worker: alguns testes de migração renomeiam e recriam as roles do servidor.
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        plugins: [
          cloudflareTest({
            wrangler: { configPath: '../../wrangler.jsonc' },
            miniflare: {
              hyperdrives: { HYPERDRIVE: HYPERDRIVE_DE_TESTE, HYPERDRIVE_OWNER_TESTE: OWNER_DE_TESTE },
              // T63 (ACE-72): os testes de rota enviam centenas de e-mails no mesmo dia e banco; o teto diário fica
              // alto por padrão. Os testes do teto passam o próprio LIMITE_EMAILS_DIA (test/rotas/teto-emails.test.ts).
              // T66 (ACE-73): idem para o teto por origem (os pedidos sem IP dividem a chave sem-ip); os testes do teto
              // por origem passam o próprio LIMITE_EMAILS_IP_HORA (test/rotas/teto-emails-origem.test.ts).
              bindings: { LIMITE_EMAILS_DIA: '1000000', LIMITE_EMAILS_IP_HORA: '1000000' },
            },
          }),
        ],
        test: {
          name: 'workers',
          include: ['test/rotas/**/*.test.ts'],
          globalSetup: ['./test/apoio/setup-worker.ts'],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
