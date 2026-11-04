import { expect, test } from '@playwright/test';

interface Manifest {
  name: string;
  display: string;
  lang: string;
  start_url: string;
  theme_color: string;
  icons: { src: string; sizes: string; purpose?: string }[];
}

test('FUN-37: o manifest parseado tem os campos de FUN-33 e os ícones respondem', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const resposta = await request.get(href ?? '');
  expect(resposta.status()).toBe(200);
  const m = (await resposta.json()) as Manifest;
  expect(m.name).toBe('Gestão da Pelada');
  expect(m.display).toBe('standalone');
  expect(m.lang).toBe('pt-BR');
  expect(m.start_url).toBe('/');
  expect(m.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  expect(m.icons.some((i) => i.sizes === '192x192')).toBe(true);
  expect(m.icons.some((i) => i.sizes === '512x512')).toBe(true);
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icone of m.icons) {
    const r = await request.get(
      new URL(icone.src, new URL(href ?? '', 'http://127.0.0.1:8787/')).href,
    );
    expect(r.status(), icone.src).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  }
});

test('FUN-37: depois do registro, o service worker controla a página', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const controla = await page.evaluate(() => navigator.serviceWorker.controller !== null);
  expect(controla).toBe(true);
});

test('FUN-37, FUN-35: sem rede, uma rota fora do cache mostra a página offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.goto('/grupos/nunca-visitada-no-cache');
  await expect(page.getByRole('heading', { name: 'Sem conexão' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Conecte-se');
  await context.setOffline(false);
});
