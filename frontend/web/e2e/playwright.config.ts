import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Os testes rodam contra o Worker local servindo o `dist` do build (`pnpm --filter @pelada/web build` antes). O
// comparador não precisa de servidor.
//
// SPEC_DEVIATION (conta-e-acesso, T43): os fluxos de acesso (`acesso.spec.ts`) precisam do Postgres local migrado e
// com seed e da caixa de e-mail de desenvolvimento (`EMAIL_DEV=1`, `GET /api/dev/emails`). O `.env` da raiz (se
// existir) entra no ambiente do teste; o Hyperdrive aponta para o banco local como `pelada_app`, igual ao `pnpm dev`.
const RAIZ = join(import.meta.dirname, '../../..');
if (existsSync(join(RAIZ, '.env'))) process.loadEnvFile(join(RAIZ, '.env'));

const HYPERDRIVE_FICTICIO = 'postgres://pelada_app:e2e@localhost:5432/pelada';

/** Hyperdrive local de `DATABASE_URL` + `PELADA_APP_SENHA`; sem eles (ou com banco que não é local), a string fictícia. */
function hyperdriveLocal(): string {
  const url = process.env['DATABASE_URL'];
  const senha = process.env['PELADA_APP_SENHA'];
  if (!url || !senha) return HYPERDRIVE_FICTICIO;
  const destino = new URL(url);
  if (destino.hostname !== 'localhost' && destino.hostname !== '127.0.0.1') return HYPERDRIVE_FICTICIO;
  destino.username = 'pelada_app';
  destino.password = encodeURIComponent(senha);
  // O Postgres do compose escuta só em 127.0.0.1: `localhost` tentaria ::1 antes e atrasaria cada conexão.
  if (destino.hostname === 'localhost') destino.hostname = '127.0.0.1';
  return destino.toString();
}

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  // Os fluxos de acesso compartilham o banco e a caixa de e-mail do Worker: um por vez.
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:8798' } }],
  webServer: {
    command:
      'pnpm --filter @pelada/api exec wrangler dev --config ../../wrangler.jsonc --port 8798 --ip 127.0.0.1 --var EMAIL_DEV:1',
    cwd: '../../..',
    url: 'http://127.0.0.1:8798',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: hyperdriveLocal(),
      // O `.env` da raiz não vira segredo do Worker local: ele recebe só o que o wrangler.jsonc e `--var` declaram.
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    },
  },
});
