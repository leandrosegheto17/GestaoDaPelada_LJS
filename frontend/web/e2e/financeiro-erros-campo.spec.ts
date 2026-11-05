import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Mensagem de erro ao lado do campo no financeiro (financeiro T46; FIN-47), em PC e celular, no molde de
 * `erros-campo.spec.ts` (GEL-118): no t23 `erro` (422 da API, `respostas/financeiro-erro-lancamento.json`, já no
 * formato do contrato) e no t24 `erro` (o texto "mil" no saldo inicial, recusado pelo próprio formulário), cada
 * mensagem fica logo abaixo do seu campo (o topo dela entre a base do campo e o topo do campo seguinte da mesma
 * coluna) e alinhada à esquerda dele (até 4 px), dentro da mesma linha do formulário (o `div.campo` do campo). No t23,
 * o resumo "Corrija 2 campos" fica acima do primeiro campo.
 */

const RESPOSTAS = fileURLToPath(new URL('../../../.specs/mockup/respostas/', import.meta.url));

function lerTexto(arquivo: string): string {
  return readFileSync(`${RESPOSTAS}${arquivo}`, 'utf8');
}

const VIEWPORTS = [
  { nome: 'pc', largura: 1280, altura: 900 },
  { nome: 'celular', largura: 390, altura: 844 },
] as const;

function json(corpo: string, status = 200) {
  return { status, contentType: 'application/json', body: corpo };
}

async function prepararApi(pagina: Page) {
  await pagina.route('**/api/sessao', (rota) => rota.fulfill(json(lerTexto('acesso-sessao-leandro.json'))));
  await pagina.route('**/api/grupos/g-quinta', (rota) => rota.fulfill(json(lerTexto('elenco-grupo-quinta.json'))));
  await pagina.route('**/api/grupos/g-quinta/financeiro/mes*', (rota) => rota.fulfill(json(lerTexto('financeiro-2026-10.json'))));
}

async function caixa(local: Locator) {
  const c = await local.boundingBox();
  expect(c, 'elemento sem caixa (invisível ou fora da página)').not.toBeNull();
  return c!;
}

/** Para cada campo com erro: a mensagem abaixo da entrada, antes do campo seguinte, alinhada e dentro do mesmo campo. */
async function conferirAoLado(pagina: Page, campos: readonly { id: string; seguinte: string | null }[]) {
  for (const { id, seguinte } of campos) {
    const entrada = await caixa(pagina.locator(`#${id}`));
    const mensagem = await caixa(pagina.locator(`#${id}-erro`));
    const linha = await caixa(pagina.locator(`#${id}-erro`).locator('xpath=..'));
    expect(mensagem.y, `${id}: a mensagem começa abaixo da base do campo`).toBeGreaterThanOrEqual(entrada.y + entrada.height - 1);
    expect(mensagem.y + mensagem.height, `${id}: a mensagem fica dentro da linha do campo`).toBeLessThanOrEqual(linha.y + linha.height + 1);
    expect(entrada.y, `${id}: a entrada e a mensagem estão na mesma linha do formulário`).toBeGreaterThanOrEqual(linha.y - 1);
    if (seguinte !== null) {
      const proximo = await caixa(pagina.locator(`label[for="${seguinte}"]`));
      // Em duas colunas (PC, t24) o campo seguinte pode estar ao lado: a regra vale para o seguinte na mesma coluna.
      if (Math.abs(proximo.x - entrada.x) <= 4) {
        expect(mensagem.y, `${id}: a mensagem começa antes do campo seguinte`).toBeLessThan(proximo.y);
      }
    }
    expect(Math.abs(mensagem.x - entrada.x), `${id}: a mensagem alinhada à esquerda do campo`).toBeLessThanOrEqual(4);
  }
}

for (const vp of VIEWPORTS) {
  test.describe(`FIN-47: erro ao lado do campo no financeiro (${vp.nome})`, () => {
    test.use({ viewport: { width: vp.largura, height: vp.altura }, serviceWorkers: 'block' });

    test(`FIN-47: t23 erro, descrição e valor (${vp.nome})`, async ({ page }) => {
      await prepararApi(page);
      await page.route('**/api/grupos/g-quinta/financeiro/lancamentos', (rota) =>
        rota.request().method() === 'POST' ? rota.fulfill(json(lerTexto('financeiro-erro-lancamento.json'), 422)) : rota.fallback(),
      );
      await page.goto('/app/grupos/g-quinta/financeiro/lancamentos/novo');
      await expect(page.getByText('0 de 80')).toBeVisible();
      await page.getByText('Saída', { exact: true }).click();
      await page.getByLabel('Valor (R$)').fill('0,00');
      await page.getByRole('button', { name: 'Salvar' }).click();

      const resumo = page.getByRole('alert').filter({ hasText: 'Corrija 2 campos:' });
      await expect(resumo).toBeVisible();
      await expect(resumo.getByRole('link')).toHaveText(['Descrição', 'Valor']);
      await expect(page.locator('#desc-erro')).toHaveText('Informe a descrição.');
      await expect(page.locator('#valor-erro')).toHaveText('O valor precisa ser maior que zero.');

      const caixaResumo = await caixa(resumo);
      const primeiro = await caixa(page.locator('#tipo'));
      expect(caixaResumo.y + caixaResumo.height, 'o resumo fica acima do primeiro campo').toBeLessThanOrEqual(primeiro.y);

      await conferirAoLado(page, [
        { id: 'desc', seguinte: 'valor' },
        { id: 'valor', seguinte: null },
      ]);
    });

    test(`FIN-47: t24 erro, saldo inicial (${vp.nome})`, async ({ page }) => {
      await prepararApi(page);
      let chamouPut = false;
      await page.route('**/api/grupos/g-quinta/financeiro/config', (rota) => {
        chamouPut = true;
        return rota.fulfill(json('{}'));
      });
      await page.goto('/app/grupos/g-quinta/financeiro/config');
      await expect(page.getByLabel('Mensalidade (opcional, R$)')).toHaveValue('75,00');
      await page.getByLabel('Saldo inicial (R$)').fill('mil');
      await page.getByRole('button', { name: 'Salvar' }).click();

      await expect(page.locator('#saldo-erro')).toHaveText('Informe um valor em reais, ex.: 350,00.');
      await conferirAoLado(page, [{ id: 'saldo', seguinte: null }]);
      expect(chamouPut, 'o texto inválido não vai à API (FIN-48)').toBe(false);
    });
  });
}
