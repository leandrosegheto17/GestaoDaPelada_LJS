import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Mensagem do peso ao lado do campo (partidas-e-ranking T62; PAR-12), em PC e celular: com um peso fora da faixa, a
 * mensagem "Use um número inteiro de −10 a 10." fica na mesma linha ou logo abaixo do campo dela (distância vertical
 * entre a base do campo e o topo da mensagem de no máximo 24 px), alinhada à esquerda do campo. A validação é local:
 * nenhum POST sai. Molde: `erros-campo.spec.ts`.
 */

const RESPOSTAS = fileURLToPath(new URL('../../../.specs/mockup/respostas/', import.meta.url));

function lerResposta(arquivo: string): unknown {
  return JSON.parse(readFileSync(`${RESPOSTAS}${arquivo}`, 'utf8')) as unknown;
}

const SESSAO = lerResposta('acesso-sessao-leandro.json');
const PESOS = lerResposta('pesos.json');

const VIEWPORTS = [
  { nome: 'pc', largura: 1280, altura: 900 },
  { nome: 'celular', largura: 390, altura: 844 },
] as const;

async function prepararApi(pagina: Page, posts: string[]) {
  await pagina.route('**/api/sessao', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSAO) }));
  await pagina.route('**/api/grupos/*/pesos', (rota) => {
    if (rota.request().method() === 'POST') {
      posts.push(rota.request().url());
      return rota.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    }
    return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PESOS) });
  });
}

async function caixa(local: Locator) {
  const c = await local.boundingBox();
  expect(c, 'elemento sem caixa (invisível ou fora da página)').not.toBeNull();
  return c!;
}

for (const vp of VIEWPORTS) {
  test.describe(`PAR-12: erro do peso ao lado do campo (${vp.nome})`, () => {
    test.use({ viewport: { width: vp.largura, height: vp.altura }, serviceWorkers: 'block' });

    test(`PAR-12: presença com chuva 11 (${vp.nome})`, async ({ page }) => {
      const posts: string[] = [];
      await prepararApi(page, posts);
      const grupos = (SESSAO as { grupos?: Array<{ id: string }> }).grupos ?? [];
      const grupoId = grupos[0]?.id ?? 'g-quinta';
      await page.goto(`/app/grupos/${grupoId}/pontuacao`);

      await page.getByLabel('Presença com chuva').fill('11');
      await page.getByRole('button', { name: 'Salvar nova configuração' }).click();

      const mensagem = page.locator('#presencaComChuva-erro');
      await expect(mensagem).toHaveText('Use um número inteiro de −10 a 10.');
      const entrada = await caixa(page.locator('#presencaComChuva'));
      const erro = await caixa(mensagem);
      const distancia = erro.y - (entrada.y + entrada.height);
      // Na mesma linha (o topo da mensagem dentro da altura do campo) ou logo abaixo (até 24 px da base).
      expect(erro.y, 'a mensagem não fica acima do campo').toBeGreaterThanOrEqual(entrada.y);
      expect(distancia, 'a mensagem fica logo abaixo do campo (≤ 24 px)').toBeLessThanOrEqual(24);
      expect(Math.abs(erro.x - entrada.x), 'a mensagem alinhada à esquerda do campo').toBeLessThanOrEqual(4);
      expect(posts, 'a validação local não envia').toEqual([]);
    });
  });
}
