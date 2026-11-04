import { expect, test } from '@playwright/test';

test('FUN-29: GET / traz CSP, nosniff, Referrer-Policy e Strict-Transport-Security', async ({
  request,
}) => {
  const r = await request.get('/');
  expect(r.status()).toBe(200);
  const h = r.headers();
  const csp = h['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/script-src 'self'(;|$)/);
  expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
});

test('FUN-29: um asset do build (JS) também traz os cabeçalhos', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const js = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  expect(js).toBeTruthy();
  const r = await request.get(js ?? '');
  expect(r.status()).toBe(200);
  expect(r.headers()['x-content-type-options']).toBe('nosniff');
  expect(r.headers()['content-security-policy']).toContain("default-src 'self'");
});

test('FUN-22: GET /api/health traz no-store e nosniff', async ({ request }) => {
  const r = await request.get('/api/health');
  expect(r.status()).toBe(200);
  expect(r.headers()['cache-control']).toContain('no-store');
  expect(r.headers()['x-content-type-options']).toBe('nosniff');
});
