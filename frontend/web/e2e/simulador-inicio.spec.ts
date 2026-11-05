import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Linha da escalação abaixo do item Simulador no início do grupo (simulador T51; SIM-08), em PC e celular: o topo da
 * linha "Escalação de 22/10 confirmada" (ou "Nenhuma escalação confirmada para 22/10") fica abaixo da base do botão
 * "Simulador: qui, 22/10", na mesma coluna (bordas esquerdas a até 4 px). A posição é provada por `boundingBox`, não
 * por texto. A API é respondida pela própria página. Molde: `pontuacao.spec.ts`.
 */

const RESPOSTAS = fileURLToPath(new URL('../../../.specs/mockup/respostas/', import.meta.url));

function lerResposta(arquivo: string): unknown {
  return JSON.parse(readFileSync(`${RESPOSTAS}${arquivo}`, 'utf8')) as unknown;
}

const SESSAO = lerResposta('acesso-sessao-leandro.json');

/** `GET /api/grupos/:grupoId` no formato do contrato (`grupoDetalheComPartidas`). */
function grupo(grupoId: string, escalacaoNoProximoDia: boolean) {
  return {
    id: grupoId,
    nome: 'Pelada de Quinta',
    slug: 'pelada-de-quinta',
    linkPublico: 'https://exemplo.test/g/pelada-de-quinta',
    diaSemana: 'quinta',
    frequencia: 'semanal',
    horario: '20:00',
    jogadoresAtivos: 20,
    habilidades: 6,
    admins: 2,
    souCriador: true,
    dataSugeridaPartida: '2026-10-22',
    partidaNaDataSugerida: false,
    partidasNoMes: 3,
    pesosVigentesDesde: '2026-09-01',
    pesosPadrao: false,
    aparelhosNaSemana: 9,
    proximoDiaDeJogo: '2026-10-22',
    escalacaoNoProximoDia,
  };
}

const VIEWPORTS = [
  { nome: 'pc', largura: 1280, altura: 900 },
  { nome: 'celular', largura: 390, altura: 844 },
] as const;

async function prepararApi(pagina: Page, grupoId: string, escalacaoNoProximoDia: boolean) {
  await pagina.route('**/api/sessao', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSAO) }));
  await pagina.route(`**/api/grupos/${grupoId}`, (rota) =>
    rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(grupo(grupoId, escalacaoNoProximoDia)) }),
  );
}

async function caixa(local: Locator) {
  const c = await local.boundingBox();
  expect(c, 'elemento sem caixa (invisível ou fora da página)').not.toBeNull();
  return c!;
}

const CASOS = [
  { escalacao: true, texto: 'Escalação de 22/10 confirmada' },
  { escalacao: false, texto: 'Nenhuma escalação confirmada para 22/10' },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`SIM-08: linha da escalação abaixo do item Simulador (${vp.nome})`, () => {
    test.use({ viewport: { width: vp.largura, height: vp.altura }, serviceWorkers: 'block' });

    for (const caso of CASOS) {
      test(`SIM-08: "${caso.texto}" abaixo do item (${vp.nome})`, async ({ page }) => {
        const grupos = (SESSAO as { grupos?: Array<{ id: string }> }).grupos ?? [];
        const grupoId = grupos[0]?.id ?? 'g-quinta';
        await prepararApi(page, grupoId, caso.escalacao);
        await page.goto(`/app/grupos/${grupoId}`);

        const dia = page.getByRole('region', { name: 'Dia de jogo' });
        const item = dia.getByRole('link', { name: 'Simulador: qui, 22/10' });
        const linha = dia.getByText(caso.texto, { exact: true });
        await expect(item).toBeVisible();
        await expect(linha).toBeVisible();

        const c = await caixa(item);
        const l = await caixa(linha);
        expect(l.y, 'o topo da linha fica abaixo da base do item').toBeGreaterThanOrEqual(c.y + c.height);
        expect(Math.abs(l.x - c.x), 'a linha na mesma coluna do item').toBeLessThanOrEqual(4);
      });
    }
  });
}
