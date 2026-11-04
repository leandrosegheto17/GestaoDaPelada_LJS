import { expect, test } from '@playwright/test';

test('FUN-37: / mostra a página provisória e /api/health responde 200 pelo mesmo servidor', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByText('Gestão da Pelada').first()).toBeVisible();

  const saude = await request.get('/api/health');
  expect(saude.status()).toBe(200);
  expect(await saude.json()).toMatchObject({ status: 'ok' });
});
