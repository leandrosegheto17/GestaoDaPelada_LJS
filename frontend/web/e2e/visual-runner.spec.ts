import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { compararPng } from './ferramentas/comparar.mjs';
import {
  aplicarRespostas,
  cssOcultar,
  entradasAtivas,
  executarPassos,
  ocultarDe,
  printTela,
  RELOGIO_VISUAL,
  type MapaTelas,
} from './ferramentas/telas-reais.mjs';

/**
 * Runner visual com telas reais (T54; ACE-54, ACE-55; AD-021), contra o build servido pelo
 * `wrangler dev` do e2e: as `respostas` do `telas.json` são servidas pelas rotas falsas e a tela
 * renderiza com elas; os `passos` rodam; o `recorte` compara só o seletor.
 */

// O service worker atenderia o fetch por fora das rotas falsas do Playwright.
test.use({ serviceWorkers: 'block' });

const MOCKUP = fileURLToPath(new URL('../../../.specs/mockup', import.meta.url));
const MAPA = JSON.parse(readFileSync(`${MOCKUP}/telas.json`, 'utf8')) as MapaTelas;

function entrada(id: string, estado: string) {
  const [e] = entradasAtivas(MAPA, { telas: [{ id, estado }] });
  if (!e) throw new Error(`${id} ${estado}`);
  return e;
}

test('ACE-54: uma entrada com respostas serve o JSON indicado e a tela renderiza com ele', async ({ page }) => {
  const t32 = entrada('T32', 'sucesso');
  await aplicarRespostas(page, t32, { mockup: MOCKUP, globais: MAPA.respostas ?? [] });
  await page.goto(t32.rota ?? '/');
  await expect(page.getByRole('heading', { level: 1, name: 'Minha conta' })).toBeVisible();
  // Nome e e-mail vêm de respostas/acesso-sessao-leandro.json.
  await expect(page.getByText('leandro@exemplo.com.br')).toBeVisible();
});

test('ACE-54: chamada de API sem resposta na entrada recebe 404, não o index.html', async ({ page }) => {
  const t32 = entrada('T32', 'sucesso');
  await aplicarRespostas(page, t32, { mockup: MOCKUP });
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const resposta = await fetch('/api/qualquer-coisa');
    return { status: resposta.status, corpo: (await resposta.json()) as { codigo: string } };
  });
  expect(r).toEqual({ status: 404, corpo: { erro: 'Não encontrado.', codigo: 'nao_encontrado' } });
});

test('ACE-54: os passos rodam e o erro antigo do mockup chega como o código do contrato', async ({ page }) => {
  const t25 = entrada('T25', 'erro');
  await aplicarRespostas(page, t25, { mockup: MOCKUP });
  await page.goto(t25.rota ?? '/');
  await executarPassos(page, t25.passos);
  await expect(page.locator('#atual-erro')).toHaveText('Senha atual incorreta.');
});

test('ACE-54: recorte compara só o seletor indicado nas duas imagens', async ({ page }) => {
  const viewport = { width: 400, height: 300 };
  const alvo = '<div class="alvo" style="width:200px;height:80px;background:#1b5e20"></div>';
  const a = `data:text/html,${encodeURIComponent(`<body style="margin:0">${alvo}<p style="font:40px sans-serif">AAAA</p></body>`)}`;
  const b = `data:text/html,${encodeURIComponent(`<body style="margin:0">${alvo}<p style="font:40px sans-serif;color:red">BBBBBBBB</p></body>`)}`;

  const inteiraA = await printTela(page, a, viewport);
  const inteiraB = await printTela(page, b, viewport);
  expect(compararPng(inteiraA, inteiraB).passou).toBe(false);

  const recorteA = await printTela(page, a, viewport, { recorte: '.alvo' });
  const recorteB = await printTela(page, b, viewport, { recorte: '.alvo' });
  const r = compararPng(recorteA, recorteB);
  expect(r.passou).toBe(true);
  expect(r.diferentes).toBe(0);
});

test('PAR-146: ocultar esconde o seletor nas duas imagens', async ({ page }) => {
  const viewport = { width: 400, height: 300 };
  const pagina = (texto: string) =>
    `data:text/html,${encodeURIComponent(`<body style="margin:0"><p style="font:40px sans-serif">Igual</p><p class="variavel" style="font:40px sans-serif;color:red">${texto}</p></body>`)}`;

  const semOcultar = compararPng(await printTela(page, pagina('AAAA'), viewport), await printTela(page, pagina('BBBBBBBB'), viewport));
  expect(semOcultar.passou).toBe(false);

  const css = cssOcultar(ocultarDe({ viewports: {}, ocultar: ['.variavel'] }, { id: 'X', estado: 'y', mockup: 'm' }));
  const a = await printTela(page, pagina('AAAA'), viewport, { ocultar: css });
  const b = await printTela(page, pagina('BBBBBBBB'), viewport, { ocultar: css });
  const r = compararPng(a, b);
  expect(r.passou).toBe(true);
  expect(r.diferentes).toBe(0);
});

test('PAR-151: abortar derruba a requisição (falha de rede, não um status)', async ({ page }) => {
  // A t01 erro só vira real na T76; aqui basta a entrada do telas.json.
  const t01 = (MAPA.telas ?? []).find((t) => t.id === 'T01' && t.estado === 'erro');
  if (!t01) throw new Error('T01 erro');
  await aplicarRespostas(page, t01, { mockup: MOCKUP, globais: MAPA.respostas ?? [] });
  await page.goto('/');
  const r = await page.evaluate(async () => {
    try {
      const resposta = await fetch('/api/publico/pelada-de-quinta/ranking');
      return `status ${resposta.status}`;
    } catch (erro) {
      return `falhou: ${(erro as Error).name}`;
    }
  });
  expect(r).toBe('falhou: TypeError');
});

test('PAR-146, AD-044: com o relógio congelado em 2026-10-16, a t09 sem-jogadores mostra "Nenhuma em outubro"', async ({ page }) => {
  const t09 = entrada('T09', 'sem-jogadores');
  await aplicarRespostas(page, t09, { mockup: MOCKUP, globais: MAPA.respostas ?? [] });
  await printTela(page, t09.rota ?? '/', { width: 390, height: 844 }, { relogio: RELOGIO_VISUAL });
  await expect(page.getByText('Nenhuma em outubro')).toBeVisible();
  expect(await page.evaluate(() => new Date().toISOString().slice(0, 10))).toBe('2026-10-16');
});
