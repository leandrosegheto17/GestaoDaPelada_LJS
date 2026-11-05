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

/**
 * Asaas falso do e2e (planos-e-cobranca T30): o Worker fala com ele por `ASAAS_URL`, e ele dispara o webhook no Worker
 * com o token. Chave e token são valores falsos, só do e2e (nunca com o prefixo das chaves do Asaas).
 */
export const PORTA_ASAAS_FALSO = 8789;
export const URL_ASAAS_FALSO = `http://127.0.0.1:${PORTA_ASAAS_FALSO}`;
const CHAVE_ASAAS_E2E = 'chave-falsa-do-e2e';
export const TOKEN_WEBHOOK_E2E = 'token-falso-do-webhook-do-e2e-com-32-caracteres';

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
  webServer: [
    {
      command: 'node e2e/apoio/asaas-falso.mjs',
      url: `${URL_ASAAS_FALSO}/fatura/saude`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        ASAAS_FALSO_PORTA: String(PORTA_ASAAS_FALSO),
        ASAAS_FALSO_WEBHOOK: `${URL_BASE}/api/webhooks/asaas`,
        ASAAS_FALSO_TOKEN: TOKEN_WEBHOOK_E2E,
      },
    },
    {
      // EMAIL_DEV=1: os e-mails vão para a caixa `GET /api/dev/emails` (T17), que as jornadas de
      // acesso leem (T57); URL_PUBLICA local, para os links dos e-mails apontarem para cá. As duas
      // só por --var: o wrangler.jsonc nunca leva EMAIL_DEV (checagem `email-dev`).
      command: `pnpm --filter @pelada/api exec wrangler dev --config ../../wrangler.jsonc --ip 127.0.0.1 --port ${PORTA_E2E} --var EMAIL_DEV:1 --var URL_PUBLICA:${URL_BASE} --var ASAAS_URL:${URL_ASAAS_FALSO}/v3 --var ASAAS_API_KEY:${CHAVE_ASAAS_E2E} --var ASAAS_WEBHOOK_TOKEN:${TOKEN_WEBHOOK_E2E}`,
      url: `${URL_BASE}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: ambienteDoServidor(),
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
