import { expect, test } from '@playwright/test';
import { CABECALHOS_DOS_ASSETS, fontesDeScript } from '../test/apoio/cabecalhos.ts';

/**
 * Cabeçalhos de segurança no servidor do e2e (FUN-29, FUN-22): os assets recebem os do
 * `_headers` e as respostas de `/api/*` recebem os do Worker.
 */

const ASSETS = ['/', '/offline.html', '/manifest.webmanifest', '/icones/icone-192.png'];

for (const caminho of ASSETS) {
  test(`FUN-29: GET ${caminho} traz CSP, nosniff, Referrer-Policy e Strict-Transport-Security`, async ({ request }) => {
    const resposta = await request.get(caminho);
    expect(resposta.status()).toBe(200);
    const cabecalhos = resposta.headers();
    for (const [nome, valor] of Object.entries(CABECALHOS_DOS_ASSETS)) {
      expect(cabecalhos[nome], `${nome} em ${caminho}`).toBe(valor);
    }
    const script = fontesDeScript(cabecalhos['content-security-policy'] ?? '');
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });
}

test('FUN-29: rota da SPA fora dos arquivos (fallback para o index) também traz os cabeçalhos', async ({ request }) => {
  const resposta = await request.get('/rota/que/nao/existe');
  const cabecalhos = resposta.headers();
  for (const [nome, valor] of Object.entries(CABECALHOS_DOS_ASSETS)) {
    expect(cabecalhos[nome], nome).toBe(valor);
  }
});

test('FUN-29: a página / carrega sem violar a CSP', async ({ page }) => {
  const violacoes: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) violacoes.push(m.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Em breve' })).toBeVisible();
  expect(violacoes).toEqual([]);
});

for (const caminho of ['/api/health', '/api/rota-inexistente']) {
  test(`FUN-22: GET ${caminho} traz no-store e nosniff`, async ({ request }) => {
    const resposta = await request.get(caminho);
    const cabecalhos = resposta.headers();
    expect(cabecalhos['cache-control']).toBe('no-store');
    expect(cabecalhos['x-content-type-options']).toBe('nosniff');
  });
}
