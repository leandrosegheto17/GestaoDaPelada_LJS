import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * e2e do front (FUN-37, design C6): o Playwright roda contra o build (`dist/`) servido pelo
 * `wrangler dev`, o mesmo Worker da prévia, com os assets e o `/api/*` no mesmo endereço. O
 * script `e2e` do package.json faz o build antes.
 *
 * Banco: o `/api/health` não toca o banco; o Hyperdrive local aponta para o Postgres do docker
 * compose com a senha de `pelada_app` lida do `.env` da raiz (nunca escrita aqui).
 */

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const ENV_DA_RAIZ = `${RAIZ}.env`;
if (existsSync(ENV_DA_RAIZ)) process.loadEnvFile(ENV_DA_RAIZ);

export const PORTA_E2E = 8788;
export const URL_BASE = `http://127.0.0.1:${PORTA_E2E}`;

function ambienteDoServidor(): Record<string, string> {
  const ambiente: Record<string, string> = {};
  const senha = process.env.PELADA_APP_SENHA;
  if (senha) {
    const porta = process.env.PELADA_DEV_BANCO_PORTA || '5432';
    ambiente.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = `postgres://pelada_app:${encodeURIComponent(senha)}@127.0.0.1:${porta}/pelada`;
  }
  return ambiente;
}

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: URL_BASE,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // EMAIL_DEV=1: os e-mails vão para a caixa `GET /api/dev/emails` (T17), que as jornadas de
    // acesso leem (T57); URL_PUBLICA local, para os links dos e-mails apontarem para cá. As duas
    // só por --var: o wrangler.jsonc nunca leva EMAIL_DEV (checagem `email-dev`).
    command: `pnpm --filter @pelada/api exec wrangler dev --config ../../wrangler.jsonc --ip 127.0.0.1 --port ${PORTA_E2E} --var EMAIL_DEV:1 --var URL_PUBLICA:${URL_BASE}`,
    url: `${URL_BASE}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: ambienteDoServidor(),
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
