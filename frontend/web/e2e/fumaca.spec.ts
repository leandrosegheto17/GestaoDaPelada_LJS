import { expect, test } from '@playwright/test';

/**
 * Fumaça do e2e (FUN-37): o build servido pelo Worker mostra a página provisória em `/`, e o
 * `/api/health` responde pelo mesmo servidor.
 */

test('FUN-37: / mostra a página provisória do build servido pelo Worker', async ({ page }) => {
  const resposta = await page.goto('/');
  expect(resposta?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Em breve' })).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page).toHaveTitle('Gestão da Pelada');
});

test('FUN-37: /api/health responde 200 pelo mesmo servidor', async ({ request }) => {
  const resposta = await request.get('/api/health');
  expect(resposta.status()).toBe(200);
  expect(await resposta.json()).toMatchObject({ status: 'ok' });
});
