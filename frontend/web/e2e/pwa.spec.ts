import { expect, test, type Page } from '@playwright/test';

interface Manifesto {
  name: string;
  short_name: string;
  display: string;
  lang: string;
  start_url: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

/** Espera o service worker ativo e controlando a página (o `clientsClaim` assume sem recarregar). */
async function esperarControle(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

// FUN-32, FUN-33, FUN-34 e FUN-36: instalabilidade do PWA contra o build servido pelo Worker (sem Lighthouse, AD-005).
test.describe('PWA instalável', () => {
  test('o manifest é válido e aponta para o ícone em cada tamanho, um deles maskable', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();

    const resposta = await request.get(href ?? '');
    expect(resposta.ok()).toBe(true);
    const manifesto = (await resposta.json()) as Manifesto;
    expect(manifesto).toMatchObject({
      name: 'Gestão da Pelada',
      short_name: 'Pelada',
      display: 'standalone',
      lang: 'pt-BR',
      start_url: '/',
    });
    expect(manifesto.icons.map((i) => `${i.sizes}:${i.purpose}`).sort()).toEqual([
      '192x192:any',
      '512x512:any',
      '512x512:maskable',
    ]);

    for (const icone of manifesto.icons) {
      const r = await request.get(icone.src);
      expect(r.status(), icone.src).toBe(200);
      expect(r.headers()['content-type'], icone.src).toContain('image/png');
    }
  });

  test('o service worker fica ativo e controla a página', async ({ page }) => {
    await esperarControle(page);
    const estado = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);
    expect(estado).toBe('activated');
  });

  test('o Chromium não aponta erro de instalabilidade', async ({ page }) => {
    await esperarControle(page);
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
      installabilityErrors: unknown[];
    };
    expect(installabilityErrors).toEqual([]);
  });

  test('sem rede, o shell continua abrindo e /offline.html é servido do cache', async ({ page, context }) => {
    await esperarControle(page);
    await context.setOffline(true);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Em breve' })).toBeVisible();

    await page.goto('/offline.html');
    await expect(page.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible();
  });

  test('sem rede e sem o shell no cache, a navegação cai na página offline', async ({ page, context }) => {
    await esperarControle(page);
    // Tira só o index.html do precache: o SW não tem mais o shell, e a rede está fora.
    await page.evaluate(async () => {
      for (const nome of await caches.keys()) {
        const cache = await caches.open(nome);
        for (const pedido of await cache.keys()) {
          if (new URL(pedido.url).pathname === '/index.html') await cache.delete(pedido);
        }
      }
    });
    await context.setOffline(true);

    await page.goto('/qualquer-rota');
    await expect(page.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible();
    await expect(page.getByText('Gestão da Pelada')).toBeVisible();
  });
});
