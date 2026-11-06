import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

/**
 * E2E da landing (planos-e-cobranca T55; PLA-61, PLA-63, PLA-64, PLA-65), contra o build servido pelo `wrangler dev`
 * (`playwright.config.ts`). A posição "lado a lado" é provada por `boundingBox`, não por texto. A sessão usa a conta do
 * seed (`admin@exemplo.test`, senha de `SEED_SENHA_ADMIN` do `.env` da raiz), como a J-08 de `acesso.spec.ts`.
 */

const CONTA_SEED = 'admin@exemplo.test';
const requerer = createRequire(import.meta.url);

async function semViolacoesAxe(pagina: Page): Promise<void> {
  // Avaliado pelo protocolo, não por <script> inline: a CSP do app (`script-src 'self'`) recusa o inline.
  await pagina.evaluate(readFileSync(requerer.resolve('axe-core/axe.min.js'), 'utf-8'));
  const violacoes = await pagina.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run: (alvo: Document) => Promise<{ violations: { id: string }[] }> };
      }
    ).axe;
    const r = await axe.run(document);
    return r.violations.map((v) => v.id);
  });
  expect(violacoes).toEqual([]);
}

function cartao(pagina: Page, nome: 'Free' | 'Pro') {
  return pagina.getByRole('region', { name: nome });
}

test.describe('landing sem sessão', () => {
  test('PLA-61: em 1280 px, Free e Pro lado a lado, com os preços', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeVisible();
    await expect(cartao(page, 'Free').getByText('Grátis')).toBeVisible();
    await expect(cartao(page, 'Pro').getByText('R$ 9,90/mês por grupo')).toBeVisible();
    await expect(cartao(page, 'Pro').getByText('14 dias de Pro grátis, sem cartão')).toBeVisible();

    const free = await cartao(page, 'Free').boundingBox();
    const pro = await cartao(page, 'Pro').boundingBox();
    if (!free || !pro) throw new Error('cartões sem caixa');
    expect(Math.abs(free.y - pro.y)).toBeLessThanOrEqual(4);
    expect(pro.x).toBeGreaterThanOrEqual(free.x + free.width);
  });

  test('PLA-61: em 390 px, os cartões ficam empilhados', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const free = await cartao(page, 'Free').boundingBox();
    const pro = await cartao(page, 'Pro').boundingBox();
    if (!free || !pro) throw new Error('cartões sem caixa');
    expect(pro.y).toBeGreaterThanOrEqual(free.y + free.height);
    expect(Math.abs(free.x - pro.x)).toBeLessThanOrEqual(4);
  });

  test('PLA-61: os botões e o rodapé levam aos destinos', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/cadastro',
    );
    await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toHaveAttribute(
      'href',
      '/entrar',
    );
    const rodape = page.locator('footer');
    await expect(rodape.getByRole('link', { name: 'Termos de uso' })).toHaveAttribute(
      'href',
      '/termos',
    );
    await expect(rodape.getByRole('link', { name: 'Privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    );
    await rodape.getByRole('link', { name: 'Termos de uso' }).click();
    await expect(page).toHaveURL(/\/termos$/);
  });

  test('PLA-65: axe sem violação e nenhuma chamada a /api/* além de /api/sessao', async ({
    page,
  }) => {
    const chamadas: string[] = [];
    page.on('request', (r) => {
      const caminho = new URL(r.url()).pathname;
      if (caminho.startsWith('/api/')) chamadas.push(caminho);
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await semViolacoesAxe(page);
    expect(new Set(chamadas)).toEqual(new Set(['/api/sessao']));
  });

  test('PLA-65: com /api/sessao fora do ar, a landing aparece inteira', async ({ page }) => {
    await page.route('**/api/sessao', (rota) =>
      rota.fulfill({ status: 500, body: '{}', contentType: 'application/json' }),
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeVisible();
    await expect(cartao(page, 'Free')).toBeVisible();
    await expect(cartao(page, 'Pro')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Criar conta' })).toBeVisible();
  });

  test('PLA-63: com ?aviso=conta-excluida, a faixa aparece', async ({ page }) => {
    await page.goto('/?aviso=conta-excluida');
    await expect(page.getByRole('status')).toHaveText('Sua conta foi excluída.');
    await expect(page.getByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeVisible();
  });
});

test('PLA-64: com sessão, / vai a /app', async ({ page }) => {
  const senhaSeed = process.env.SEED_SENHA_ADMIN;
  test.skip(
    !senhaSeed,
    'SEED_SENHA_ADMIN ausente no .env da raiz: o teste precisa da conta do seed (pnpm seed).',
  );
  const r = await page.request.post('/api/sessao/entrar', {
    headers: { 'X-Pelada': '1' },
    data: { email: CONTA_SEED, senha: senhaSeed },
  });
  expect(r.status()).toBe(200);
  await page.goto('/');
  await expect(page).toHaveURL(/\/app$/);
});
