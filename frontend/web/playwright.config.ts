import { defineConfig } from '@playwright/test';

const PORTA = 8787;

/**
 * E2E contra o build servido pelo Worker (`wrangler dev`), o mesmo servidor que entrega os arquivos estáticos e a API
 * em /api/* (FUN-37). O banco local (docker compose) precisa estar no ar; o Hyperdrive local usa o usuário `pelada_app`.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORTA}`, serviceWorkers: 'allow' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: `pnpm --filter @pelada/web build && pnpm --filter @pelada/api exec wrangler dev --config ../../wrangler.jsonc --ip 127.0.0.1 --port ${PORTA}`,
      cwd: '../..',
      url: `http://127.0.0.1:${PORTA}/api/health`,
      // O wrangler exige senha na string do Hyperdrive local; as rotas deste e2e não consultam o banco (a senha é fictícia).
      env: {
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
          'postgres://pelada_app:e2e-sem-banco@127.0.0.1:5432/pelada',
      },
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      // `pnpm dev` de verdade (FUN-04): o Vite em 5173 encaminha /api para o wrangler dev em 8788. A senha é fictícia:
      // o /api/health não consulta o banco, e o script só confere que o Postgres local está de pé.
      command: 'pnpm dev',
      cwd: '../..',
      url: 'http://127.0.0.1:5173/api/health',
      reuseExistingServer: true,
      timeout: 180_000,
      env: { PELADA_APP_SENHA: 'e2e-sem-banco', PELADA_DEV_PORTA_API: '8788' },
    },
  ],
});
