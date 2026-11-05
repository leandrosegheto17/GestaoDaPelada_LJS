import { expect, test, type Page } from '@playwright/test';

/**
 * Ranking sem conexão de ponta a ponta (partidas-e-ranking T78; PAR-149, PAR-150, PAR-151, PAR-153; Independent Test de
 * `B:463`), contra o build servido pelo `wrangler dev` com o seed (`pelada-de-quinta`, T74) e o service worker de
 * verdade: abre o ranking com rede, corta a rede e recarrega (faixa com a hora do `geradoEm` e o aviso ao tentar
 * entrar); num contexto novo, sem nada guardado, "Sem conexão".
 */

const SLUG = 'pelada-de-quinta';
const CAMINHO = `/g/${SLUG}`;

const DIA_HORA_SP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "Sem conexão, atualizado em dd/mm hh:mm" do `geradoEm`, na hora de São Paulo (a mesma conta da tela). */
function faixaDe(geradoEm: string): string {
  const partes = DIA_HORA_SP.formatToParts(new Date(geradoEm));
  const v = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `Sem conexão, atualizado em ${v('day')}/${v('month')} ${v('hour')}:${v('minute')}`;
}

/**
 * Abre o ranking com rede e espera o service worker controlar a página: o primeiro carregamento registra; o reload já
 * passa pelo SW, que guarda a resposta do ranking (PAR-153). Devolve o `geradoEm` da última resposta.
 */
async function abrirComRede(page: Page): Promise<string> {
  await page.goto(CAMINHO);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const resposta = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/publico/${SLUG}/ranking` && r.status() === 200);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const corpo = (await (await resposta).json()) as { geradoEm: string };
  await expect(page.getByRole('heading', { level: 1, name: 'Pelada de Quinta' })).toBeVisible();
  return corpo.geradoEm;
}

test('PAR-149: offline, a faixa aparece com a hora do geradoEm e o ranking fica somente leitura', async ({ page, context }) => {
  const geradoEm = await abrirComRede(page);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByText(faixaDe(geradoEm))).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Pelada de Quinta' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar PDF' })).toHaveCount(0);
  } finally {
    await context.setOffline(false);
  }
});

test('PAR-150: offline, tocar na engrenagem mostra "É preciso conexão para entrar." e não sai da página', async ({ page, context }) => {
  const geradoEm = await abrirComRede(page);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByText(faixaDe(geradoEm))).toBeVisible();
    await page.getByRole('banner').getByRole('link', { name: 'Área do admin' }).click();
    await expect(page.getByText('É preciso conexão para entrar.')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(CAMINHO);
  } finally {
    await context.setOffline(false);
  }
});

test('PAR-153: o PDF e os eventos não passam pelo cache do service worker', async ({ page }) => {
  await abrirComRede(page);
  const chaves = await page.evaluate(async () => {
    const nomes = await caches.keys();
    const urls: string[] = [];
    for (const nome of nomes) {
      const cache = await caches.open(nome);
      for (const r of await cache.keys()) urls.push(new URL(r.url).pathname);
    }
    return urls.filter((u) => u.startsWith('/api/'));
  });
  expect(chaves.length).toBeGreaterThan(0);
  expect(chaves.every((u) => /^\/api\/publico\/[a-z0-9-]+\/ranking$/.test(u))).toBe(true);
});

test('PAR-151: num contexto novo, sem nada guardado e sem rede, "Sem conexão" com "Tentar de novo"', async ({ browser }) => {
  // Sem service worker: senão o fetch sairia do SW, por fora da rota falsa do Playwright.
  const contexto = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await contexto.newPage();
    // Sem guardado neste contexto: a página abre, mas a rede do ranking falha.
    await page.route(`**/api/publico/${SLUG}/ranking*`, (r) => r.abort('internetdisconnected'));
    await page.goto(CAMINHO);
    await expect(page.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible();
    await expect(page.getByText('Conecte-se para ver o ranking.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('pelada:ranking:')))).toEqual([]);
  } finally {
    await contexto.close();
  }
});
