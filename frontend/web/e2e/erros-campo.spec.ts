import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Mensagem de erro ao lado do campo (grupos-e-elenco T72, GEL-118), em PC e celular: com o 422 das respostas do mockup
 * (`erro-validacao-novo-grupo.json` e `elenco-erro-novo-jogador.json`), cada mensagem fica logo abaixo do seu campo
 * (o topo dela entre a base do campo e o topo do campo seguinte), alinhada à esquerda do campo (até 4 px), e o resumo
 * "Corrija N campos" fica acima do primeiro campo. As respostas da API são interceptadas (`page.route`), como no runner
 * visual da CA; o app vem do servidor do e2e (`playwright.config.ts`).
 *
 * As respostas do mockup estão no formato antigo (`erro.campos` como objeto); `corpoDoContrato` as leva ao
 * `corpoErro` do contrato (`campos` com os nomes e `mensagens` com o texto de cada um, T20).
 */

const RESPOSTAS = fileURLToPath(new URL('../../../.specs/mockup/respostas/', import.meta.url));

function lerResposta(arquivo: string): unknown {
  return JSON.parse(readFileSync(`${RESPOSTAS}${arquivo}`, 'utf8')) as unknown;
}

/** Formato antigo do mockup → `corpoErro`; só os campos do formulário (`aceitos`). */
function corpoDoContrato(antigo: unknown, aceitos: readonly string[]): string {
  const erro = (antigo as { erro: { mensagem: string; campos: Record<string, string> } }).erro;
  const mensagens = Object.fromEntries(
    Object.entries(erro.campos).filter(([campo]) => aceitos.includes(campo)),
  );
  return JSON.stringify({
    erro: erro.mensagem,
    codigo: 'dados_invalidos',
    campos: Object.keys(mensagens).sort(),
    mensagens,
  });
}

const SESSAO = lerResposta('acesso-sessao-leandro.json');

const VIEWPORTS = [
  { nome: 'pc', largura: 1280, altura: 900 },
  { nome: 'celular', largura: 390, altura: 844 },
] as const;

async function prepararSessao(pagina: Page) {
  await pagina.route('**/api/sessao', (rota) =>
    rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSAO) }),
  );
}

async function caixa(local: Locator) {
  const c = await local.boundingBox();
  expect(c, 'elemento sem caixa (invisível ou fora da página)').not.toBeNull();
  return c!;
}

/** Para cada campo com erro: a mensagem abaixo da entrada, antes do campo seguinte, e alinhada à esquerda dela. */
async function conferirAoLado(
  pagina: Page,
  campos: readonly { id: string; seguinte: string | null }[],
) {
  for (const { id, seguinte } of campos) {
    const entrada = await caixa(pagina.locator(`#${id}`));
    const mensagem = await caixa(pagina.locator(`#${id}-erro`));
    expect(mensagem.y, `${id}: a mensagem começa abaixo da base do campo`).toBeGreaterThanOrEqual(
      entrada.y + entrada.height - 1,
    );
    if (seguinte !== null) {
      const proximo = await caixa(pagina.locator(`label[for="${seguinte}"]`));
      // Em duas colunas (PC) o campo seguinte pode estar ao lado: a regra vale para o seguinte na mesma coluna.
      if (Math.abs(proximo.x - entrada.x) <= 4) {
        expect(mensagem.y, `${id}: a mensagem começa antes do campo seguinte`).toBeLessThan(
          proximo.y,
        );
      }
    }
    expect(
      Math.abs(mensagem.x - entrada.x),
      `${id}: a mensagem alinhada à esquerda do campo`,
    ).toBeLessThanOrEqual(4);
  }
}

for (const vp of VIEWPORTS) {
  test.describe(`GEL-118: erro ao lado do campo (${vp.nome})`, () => {
    test.use({ viewport: { width: vp.largura, height: vp.altura }, serviceWorkers: 'block' });

    test(`GEL-118: novo grupo, nome e horário (${vp.nome})`, async ({ page }) => {
      await prepararSessao(page);
      const corpo = corpoDoContrato(lerResposta('erro-validacao-novo-grupo.json'), [
        'nome',
        'diaSemana',
        'horario',
        'frequencia',
      ]);
      await page.route('**/api/grupos', (rota) =>
        rota.request().method() === 'POST'
          ? rota.fulfill({ status: 422, contentType: 'application/json', body: corpo })
          : rota.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ ativos: [], arquivados: [] }),
            }),
      );
      await page.goto('/app/grupos/novo');
      await page.getByLabel('Nome').fill('Ra');
      await page.getByRole('button', { name: 'Criar grupo' }).click();

      const resumo = page.getByRole('alert').filter({ hasText: 'Corrija 2 campos:' });
      await expect(resumo).toBeVisible();
      await expect(resumo.getByRole('link')).toHaveText(['Nome', 'Horário']);
      await expect(page.locator('#nome-erro')).toHaveText(
        'O nome precisa ter de 3 a 60 caracteres.',
      );
      await expect(page.locator('#hora-erro')).toHaveText('Informe o horário.');

      const caixaResumo = await caixa(resumo);
      const primeiro = await caixa(page.locator('label[for="nome"]'));
      expect(
        caixaResumo.y + caixaResumo.height,
        'o resumo fica acima do primeiro campo',
      ).toBeLessThanOrEqual(primeiro.y);

      await conferirAoLado(page, [
        { id: 'nome', seguinte: 'dia' },
        { id: 'hora', seguinte: null },
      ]);
    });

    test(`GEL-118: novo jogador, apelido e ano (${vp.nome})`, async ({ page }) => {
      await prepararSessao(page);
      const corpo = corpoDoContrato(lerResposta('elenco-erro-novo-jogador.json'), [
        'apelido',
        'anoNascimento',
        'posicao',
        'telefone',
        'dataEntrada',
        'pontuacaoInicial',
      ]);
      await page.route('**/api/grupos/g-quinta', (rota) =>
        rota.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(lerResposta('grupo-quinta.json')),
        }),
      );
      await page.route('**/api/grupos/g-quinta/jogadores', (rota) =>
        rota.request().method() === 'POST'
          ? rota.fulfill({ status: 422, contentType: 'application/json', body: corpo })
          : rota.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ jogadores: [] }),
            }),
      );
      await page.goto('/app/grupos/g-quinta/jogadores/novo');
      await page.getByLabel('Apelido').fill('toninho');
      await page.getByLabel('Ano de nascimento').fill('2020');
      await page.getByRole('button', { name: 'Salvar' }).click();

      const resumo = page.getByRole('alert').filter({ hasText: 'Corrija 2 campos:' });
      await expect(resumo).toBeVisible();
      await expect(resumo.getByRole('link')).toHaveText(['Apelido', 'Ano de nascimento']);

      const caixaResumo = await caixa(resumo);
      const primeiro = await caixa(page.locator('label[for="apelido"]'));
      expect(
        caixaResumo.y + caixaResumo.height,
        'o resumo fica acima do primeiro campo',
      ).toBeLessThanOrEqual(primeiro.y);

      await conferirAoLado(page, [
        { id: 'apelido', seguinte: 'ano' },
        { id: 'ano', seguinte: 'tel' },
      ]);
    });
  });
}
