import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { compararPng } from './ferramentas/comparar.mjs';
import { aplicarRespostas, entradasAtivas, executarPassos, printTela, type MapaTelas } from './ferramentas/telas-reais.mjs';

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
