import { expect, test, type Page } from '@playwright/test';

/**
 * Instalabilidade (FUN-37, FUN-33, FUN-35), contra o build servido pelo Worker: manifest válido,
 * ícones acessíveis, service worker controlando a página e a página offline sem rede.
 */

interface Manifesto {
  name?: string;
  display?: string;
  lang?: string;
  start_url?: string;
  icons?: { src: string; sizes: string; purpose?: string }[];
}

/** Abre `/` e espera o SW assumir: o primeiro carregamento registra; o reload já é controlado. */
async function abrirControlada(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test('FUN-37: o manifest parseado tem os campos de FUN-33 e os ícones 192 e 512 respondem', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href, 'link rel=manifest ausente no index.html do build').toBeTruthy();

  const resposta = await request.get(new URL(href ?? '', page.url()).pathname);
  expect(resposta.status()).toBe(200);
  const manifesto = (await resposta.json()) as Manifesto;
  expect(manifesto.name).toBe('Gestão da Pelada');
  expect(manifesto.display).toBe('standalone');
  expect(manifesto.lang).toBe('pt-BR');
  expect(manifesto.start_url).toBe('/');

  const icones = manifesto.icons ?? [];
  expect(icones.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(icones.some((i) => (i.purpose ?? '').split(/\s+/).includes('maskable'))).toBe(true);
  for (const icone of icones) {
    const r = await request.get(icone.src);
    expect(r.status(), icone.src).toBe(200);
    expect(r.headers()['content-type'], icone.src).toContain('image/png');
  }
});

test('FUN-37: depois do registro, navigator.serviceWorker.controller existe na página', async ({ page }) => {
  await abrirControlada(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.state)).toBeTruthy();
});

test('FUN-37: sem rede, uma rota fora do cache mostra a página offline', async ({ page, context }) => {
  await abrirControlada(page);
  await context.setOffline(true);
  try {
    await page.goto('/grupos/fora-do-cache');
    await expect(page.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('FUN-37: sem rede, / ainda abre o shell do cache', async ({ page, context }) => {
  await abrirControlada(page);
  await context.setOffline(true);
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
