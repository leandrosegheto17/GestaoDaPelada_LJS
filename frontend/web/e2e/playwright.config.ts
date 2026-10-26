import { defineConfig, devices } from '@playwright/test';

// Os testes de instalabilidade e de cabeçalhos rodam contra o Worker local servindo o `dist` do build
// (`pnpm --filter @pelada/web build` antes). O comparador não precisa de servidor.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:8798' } }],
  webServer: {
    command: 'pnpm --filter @pelada/api exec wrangler dev --config ../../wrangler.jsonc --port 8798 --ip 127.0.0.1',
    cwd: '../../..',
    url: 'http://127.0.0.1:8798',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Só os arquivos estáticos são exercitados: o Hyperdrive local precisa de uma URL válida, mas nenhuma consulta
    // chega ao banco (senha fictícia, sem efeito).
    env: {
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: 'postgres://pelada_app:e2e@localhost:5432/pelada',
    },
  },
});
