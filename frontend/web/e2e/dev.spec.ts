import { expect, test } from '@playwright/test';

test('FUN-04: com pnpm dev no ar, GET :5173/api/health responde 200 pelo proxy do Vite', async ({
  request,
}) => {
  const r = await request.get('http://127.0.0.1:5173/api/health');
  expect(r.status()).toBe(200);
  expect(await r.json()).toMatchObject({ status: 'ok' });
});

test('FUN-04: o Vite do pnpm dev serve o app em /', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.getByRole('main')).toBeVisible();
});
