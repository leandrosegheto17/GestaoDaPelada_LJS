import { generateKeyPairSync, randomBytes } from 'node:crypto';
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

/** Portas do e2e: o padrão, ou as de `PELADA_E2E_PORTA`, `PELADA_E2E_PORTA_ASAAS` e `PELADA_E2E_PORTA_PUSH` quando outra
 * sessão usa as mesmas (sem isso o `reuseExistingServer` reaproveitaria os servidores dela). */
function portaDe(variavel: string, padrao: number): number {
  const valor = Number(process.env[variavel]);
  return Number.isInteger(valor) && valor > 0 && valor < 65536 ? valor : padrao;
}

export const PORTA_E2E = portaDe('PELADA_E2E_PORTA', 8788);
export const URL_BASE = `http://127.0.0.1:${PORTA_E2E}`;

/**
 * Asaas falso do e2e (planos-e-cobranca T30): o Worker fala com ele por `ASAAS_URL`, e ele dispara o webhook no Worker
 * com o token. Chave e token são valores falsos, só do e2e (nunca com o prefixo das chaves do Asaas).
 */
export const PORTA_ASAAS_FALSO = portaDe('PELADA_E2E_PORTA_ASAAS', 8789);
export const URL_ASAAS_FALSO = `http://127.0.0.1:${PORTA_ASAAS_FALSO}`;
const CHAVE_ASAAS_E2E = 'chave-falsa-do-e2e';
export const TOKEN_WEBHOOK_E2E = 'token-falso-do-webhook-do-e2e-com-32-caracteres';

/**
 * Push falso do e2e (notificacoes T27, T41; NOT-63): o Worker manda o aviso cifrado a ele, e só aceita o endpoint
 * `http://localhost:<porta>` por `PUSH_HOSTS_DEV`, passada só aqui por `--var` (checagem `push-hosts-dev`).
 */
export const PORTA_PUSH_FALSO = portaDe('PELADA_E2E_PORTA_PUSH', 8790);
export const URL_PUSH_FALSO = `http://localhost:${PORTA_PUSH_FALSO}`;

/**
 * Par VAPID gerado a cada execução, nunca escrito em arquivo (NOT-14): a pública vai também para a jornada, que confere
 * o `applicationServerKey`. Gerado só uma vez por processo (o config é importado pelos specs).
 */
function parVapidDoE2e(): { publica: string; privada: string } {
  const guardado = process.env.PELADA_E2E_VAPID_PUBLICA;
  if (guardado && process.env.PELADA_E2E_VAPID_PRIVADA)
    return { publica: guardado, privada: process.env.PELADA_E2E_VAPID_PRIVADA };
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwkPub = publicKey.export({ format: 'jwk' });
  const jwkPriv = privateKey.export({ format: 'jwk' });
  const ponto = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwkPub.x ?? '', 'base64url'),
    Buffer.from(jwkPub.y ?? '', 'base64url'),
  ]);
  const par = { publica: ponto.toString('base64url'), privada: jwkPriv.d ?? '' };
  process.env.PELADA_E2E_VAPID_PUBLICA = par.publica;
  process.env.PELADA_E2E_VAPID_PRIVADA = par.privada;
  return par;
}

export const VAPID_E2E = parVapidDoE2e();

/**
 * Segredo por execução da caixa `GET /api/dev/emails` (SEC-04r, AD-131): o Worker do e2e o recebe por `--var` e as
 * jornadas o mandam em `X-Dev-Token`. Gerado uma vez por processo e repassado aos workers do Playwright por ambiente.
 */
function tokenDaCaixaDoE2e(): string {
  const guardado = process.env.PELADA_E2E_DEV_EMAILS_TOKEN;
  if (guardado) return guardado;
  const token = randomBytes(24).toString('base64url');
  process.env.PELADA_E2E_DEV_EMAILS_TOKEN = token;
  return token;
}

export const TOKEN_DEV_EMAILS = tokenDaCaixaDoE2e();
export const CABECALHO_DEV_EMAILS = { 'X-Dev-Token': TOKEN_DEV_EMAILS };

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
      command: 'node e2e/apoio/push-falso.mjs',
      url: `${URL_PUSH_FALSO}/saude`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { PUSH_FALSO_PORTA: String(PORTA_PUSH_FALSO) },
    },
    {
      // EMAIL_DEV=1: os e-mails vão para a caixa `GET /api/dev/emails` (T17), que as jornadas de
      // acesso leem (T57); URL_PUBLICA local, para os links dos e-mails apontarem para cá. As duas
      // só por --var: o wrangler.jsonc nunca leva EMAIL_DEV (checagem `email-dev`).
      // notificacoes T41: as VAPID do e2e e o PUSH_HOSTS_DEV do push falso, também só por --var.
      command: `pnpm --filter @pelada/api exec wrangler dev --config ../../wrangler.jsonc --ip 127.0.0.1 --port ${PORTA_E2E} --var EMAIL_DEV:1 --var DEV_EMAILS_TOKEN:${TOKEN_DEV_EMAILS} --var URL_PUBLICA:${URL_BASE} --var ASAAS_URL:${URL_ASAAS_FALSO}/v3 --var ASAAS_API_KEY:${CHAVE_ASAAS_E2E} --var ASAAS_WEBHOOK_TOKEN:${TOKEN_WEBHOOK_E2E} --var VAPID_PUBLICA:${VAPID_E2E.publica} --var VAPID_PRIVADA:${VAPID_E2E.privada} --var VAPID_ASSUNTO:mailto:avisos@exemplo.test --var PUSH_HOSTS_DEV:localhost:${PORTA_PUSH_FALSO}`,
      url: `${URL_BASE}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: ambienteDoServidor(),
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
