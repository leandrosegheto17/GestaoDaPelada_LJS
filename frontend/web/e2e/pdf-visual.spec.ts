import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { rasterizarPrimeiraPagina } from './apoio/pdf-pixels.ts';
import { compararPng, porcentagem } from './ferramentas/comparar.mjs';

/**
 * Comparação visual do PDF com o P01 (partidas-e-ranking T77; PAR-104, PAR-108; ADR-019 do legado), no molde de
 * `ljs:frontend/web/e2e/pdf-visual.spec.ts` @ `c6dc82c`: a t01 abre com as respostas do mockup, "Exportar PDF" baixa o
 * arquivo gerado pelo app (`gerarPdf`), o `pdfjs-dist` o rasteriza em 794 × 1123 px e o resultado é comparado com a
 * `.pdf-folha` de `p01-pdf--{sucesso,mes-vazio}.html`.
 *
 * Limite (ADR-019): o rasterizador do PDF e o navegador suavizam o texto de formas diferentes, então o PDF tem limite
 * próprio: 4,5% localmente e 9% no CI (no runner Linux o hinting das fontes dá 6 a 7% com o leiaute idêntico). As telas
 * seguem em 1%. O controle deforma o mockup (uma coluna deslocada) e exige que a comparação reprove.
 */

const MOCKUP = fileURLToPath(new URL('../../../.specs/mockup', import.meta.url));
const RESPOSTAS = join(MOCKUP, 'respostas');
const TELAS = join(MOCKUP, 'telas');
const RESULTADOS = fileURLToPath(new URL('../test-results/pdf-visual', import.meta.url));
const resposta = (nome: string) => readFileSync(join(RESPOSTAS, nome), 'utf8');
const json = (corpo: string) => ({ status: 200, contentType: 'application/json', body: corpo });

export const LIMITE_PDF = process.env.CI ? 0.09 : 0.045;

const ESTADOS = [
  {
    nome: 'sucesso',
    mes: '2026-10',
    pdf: 'publico-pdf-2026-10.json',
    ranking: 'publico-ranking-2026-10.json',
  },
  {
    nome: 'mes-vazio',
    mes: '2026-07',
    pdf: 'publico-pdf-2026-07.json',
    ranking: 'publico-ranking-2026-07.json',
  },
] as const;

/** Uma coluna de rodada deslocada 24 px: tem de reprovar. */
const COLUNA_DESLOCADA = '.pdf-tabela tr > :nth-child(6) { transform: translateX(24px); }';

// O PDF é rasterizado em tons de cinza; o mockup também, para o texto não diferir só pela suavização colorida.
test.use({ launchOptions: { args: ['--disable-lcd-text'] }, serviceWorkers: 'block' });

async function abrirRanking(page: Page, estado: (typeof ESTADOS)[number]) {
  await page.route('**/api/**', (r) =>
    r.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"erro":"Não encontrado.","codigo":"nao_encontrado"}',
    }),
  );
  await page.route('**/api/publico/pelada-de-quinta/ranking*', (r) =>
    r.fulfill(json(resposta(estado.ranking))),
  );
  await page.route('**/api/publico/pelada-de-quinta/pdf*', (r) =>
    r.fulfill(json(resposta(estado.pdf))),
  );
  await page.route('**/api/publico/pelada-de-quinta/eventos', (r) => r.fulfill({ status: 204 }));
  await page.goto(`/g/pelada-de-quinta?mes=${estado.mes}`);
}

async function folhaDoMockup(page: Page, nome: string, css?: string): Promise<Buffer> {
  await page.setViewportSize({ width: 860, height: 1200 });
  await page.goto(pathToFileURL(join(TELAS, `p01-pdf--${nome}.html`)).href);
  if (css) await page.addStyleTag({ content: css });
  await page.evaluate(() => document.fonts.ready);
  return page.locator('.pdf-folha').screenshot({ animations: 'disabled' });
}

function tamanho(png: Buffer): string {
  const { width, height } = PNG.sync.read(png);
  return `${width}x${height}`;
}

for (const estado of ESTADOS) {
  test(`PAR-108: PDF do ranking (${estado.nome}) confere com o mockup P01`, async ({
    page,
    context,
  }) => {
    await abrirRanking(page, estado);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar PDF' }).first().click();
    const baixado = await download;
    expect(baixado.suggestedFilename()).toBe(`ranking-pelada-de-quinta-${estado.mes}.pdf`);
    const pdf = readFileSync(await baixado.path());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    const obtido = await rasterizarPrimeiraPagina(await context.newPage(), pdf);
    const esperado = await folhaDoMockup(await context.newPage(), estado.nome);

    mkdirSync(RESULTADOS, { recursive: true });
    writeFileSync(join(RESULTADOS, `pdf-${estado.nome}-obtido.png`), obtido);
    writeFileSync(join(RESULTADOS, `pdf-${estado.nome}-mockup.png`), esperado);

    expect(tamanho(obtido)).toBe('794x1123');
    expect(tamanho(esperado)).toBe('794x1123');
    const r = compararPng(obtido, esperado, { limite: LIMITE_PDF });
    if (r.diff) writeFileSync(join(RESULTADOS, `pdf-${estado.nome}-diff.png`), r.diff);
    expect(
      r.proporcao,
      `${porcentagem(r.proporcao)} dos pixels divergem (limite ${porcentagem(LIMITE_PDF)})`,
    ).toBeLessThanOrEqual(LIMITE_PDF);
  });
}

test('PAR-108: controle, uma coluna deslocada de propósito reprova no limite do PDF', async ({
  context,
}) => {
  const certo = await folhaDoMockup(await context.newPage(), 'sucesso');
  const deslocado = await folhaDoMockup(await context.newPage(), 'sucesso', COLUNA_DESLOCADA);
  const r = compararPng(certo, deslocado, { limite: LIMITE_PDF });
  expect(r.passou, `a coluna deslocada passou com ${porcentagem(r.proporcao)}`).toBe(false);
});
