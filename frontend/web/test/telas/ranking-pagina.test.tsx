import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PaginaRanking } from '../../src/telas/ranking/PaginaRanking.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, type Manipulador } from '../apoio/tela.tsx';

/**
 * Página do ranking público (partidas-e-ranking T56; PAR-79, PAR-81, PAR-82, PAR-88, PAR-89, PAR-161; P17 de
 * `BC:29`). A rota `/g/:slug` só entra no app na T58: aqui a tela roda numa rota própria.
 */

afterEach(() => {
  cleanup();
});

const SLUG = 'pelada-de-quinta';
const API = `GET /api/publico/${SLUG}/ranking`;
const rotas = () => [{ path: '/g/:slug', element: <PaginaRanking />, handle: { tela: 'ranking' } }];

const LINHAS_OUTUBRO = [
  {
    posicao: 1,
    apelido: 'Toninho',
    ptsInicial: 27,
    rodadas: [
      { situacao: 'presente', pontos: 1 },
      { situacao: 'presente', pontos: 2 },
    ],
    ptsFinal: 30,
  },
  {
    posicao: 2,
    apelido: 'Bigode',
    ptsInicial: 26,
    rodadas: [
      { situacao: 'falta', pontos: 0 },
      { situacao: 'presente', pontos: 2 },
    ],
    ptsFinal: 28,
  },
  {
    posicao: 3,
    apelido: 'Serginho',
    ptsInicial: 0,
    rodadas: [
      { situacao: 'fora', pontos: null },
      { situacao: 'presente', pontos: 1 },
    ],
    ptsFinal: 1,
  },
];

function ranking(extra: Record<string, unknown> = {}) {
  return {
    grupo: {
      nome: 'Pelada de Quinta',
      slug: SLUG,
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '20:00',
    },
    mes: '2026-10',
    hoje: '2026-10-22',
    geradoEm: '2026-10-22T12:00:00.000Z',
    pdfLiberado: true,
    navegacao: { mesAnterior: '2026-09', mesSeguinte: null },
    resumoMes: { partidas: 2, comChuva: 1 },
    partidas: [
      { data: '2026-10-08', choveu: true },
      { data: '2026-10-15', choveu: false },
    ],
    linhas: LINHAS_OUTUBRO,
    ...extra,
  };
}

/** Mês com partidas, mas as mesmas linhas na mesma ordem (o que muda são as colunas e os pontos). */
const SETEMBRO = ranking({
  mes: '2026-09',
  navegacao: { mesAnterior: null, mesSeguinte: '2026-10' },
  resumoMes: { partidas: 1, comChuva: 0 },
  partidas: [{ data: '2026-09-24', choveu: false }],
  linhas: [
    {
      posicao: 1,
      apelido: 'Toninho',
      ptsInicial: 26,
      rodadas: [{ situacao: 'presente', pontos: 1 }],
      ptsFinal: 27,
    },
    {
      posicao: 2,
      apelido: 'Bigode',
      ptsInicial: 25,
      rodadas: [{ situacao: 'presente', pontos: 1 }],
      ptsFinal: 26,
    },
    {
      posicao: 3,
      apelido: 'Serginho',
      ptsInicial: 0,
      rodadas: [{ situacao: 'fora', pontos: null }],
      ptsFinal: 0,
    },
  ],
});

const JULHO_SEM_PARTIDAS = ranking({
  mes: '2026-07',
  navegacao: { mesAnterior: '2026-06', mesSeguinte: '2026-08' },
  resumoMes: { partidas: 0, comChuva: 0 },
  partidas: [],
  linhas: LINHAS_OUTUBRO.map((l) => ({ ...l, rodadas: [], ptsFinal: l.ptsInicial })),
});

/** Responde em sequência: a 1ª chamada recebe a 1ª resposta, e assim por diante (a última se repete). */
function emSequencia(...respostas: Array<() => Response | Promise<Response>>): Manipulador {
  let i = 0;
  return () => {
    const r = respostas[Math.min(i, respostas.length - 1)];
    i += 1;
    if (!r) throw new Error('sem resposta');
    return r();
  };
}

function apelidos(): string[] {
  return screen.getAllByRole('rowheader').map((c) => c.textContent ?? '');
}

describe('PaginaRanking', () => {
  it('PAR-79: nome, agenda, mês, "Exportar PDF", resumo do mês e a tabela', async () => {
    abrirTela(`/g/${SLUG}`, { [API]: () => json(200, ranking()) }, rotas);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pelada de Quinta' }),
    ).toBeDefined();
    expect(screen.getByText('Toda quinta · 20:00')).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'outubro de 2026' })).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Exportar PDF' }).length).toBeGreaterThan(0);
    const resumo = screen.getByText(
      (_, el) =>
        el?.tagName === 'P' &&
        el.textContent ===
          '2 partidas no mês, 1 com chuva. Ordem pelos pontos acumulados até hoje.',
    );
    expect(resumo).toBeDefined();
    expect(apelidos()).toEqual(['Toninho', 'Bigode', 'Serginho']);
  });

  it('PAR-79: uma partida usa o singular no resumo', async () => {
    abrirTela(`/g/${SLUG}`, { [API]: () => json(200, SETEMBRO) }, rotas);
    expect(
      await screen.findByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent ===
            '1 partida no mês, 0 com chuva. Ordem pelos pontos acumulados até hoje.',
      ),
    ).toBeDefined();
  });

  it('PAR-88: mês sem partidas mostra "Nenhuma partida registrada neste mês" e "Pts inicial (início de julho)"', async () => {
    abrirTela(`/g/${SLUG}?mes=2026-07`, { [API]: () => json(200, JULHO_SEM_PARTIDAS) }, rotas);
    expect(
      await screen.findByRole('cell', { name: 'Nenhuma partida registrada neste mês' }),
    ).toBeDefined();
    expect(
      screen.getByRole('columnheader', { name: 'Pts inicial (início de julho)' }),
    ).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Pts final (fim de julho)' })).toBeDefined();
    // No lugar das colunas de partida: nenhuma coluna "dd/mm".
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).not.toContain(
      expect.stringMatching(/^\d{2}\/\d{2}/),
    );
    expect(screen.getByText('Ordem pelos pontos acumulados até hoje.')).toBeDefined();
    expect(apelidos()).toEqual(['Toninho', 'Bigode', 'Serginho']);
  });

  it('PAR-89: "Mês seguinte" desabilitado quando mesSeguinte é nulo; "Mês anterior" habilitado com o nome do mês', async () => {
    abrirTela(`/g/${SLUG}`, { [API]: () => json(200, ranking()) }, rotas);
    const seguinte = await screen.findByRole('button', { name: 'Mês seguinte' });
    expect((seguinte as HTMLButtonElement).disabled).toBe(true);
    const anterior = screen.getByRole('button', { name: 'Mês anterior, setembro de 2026' });
    expect((anterior as HTMLButtonElement).disabled).toBe(false);
  });

  it('PAR-89: "Mês anterior" desabilitado quando mesAnterior é nulo', async () => {
    abrirTela(`/g/${SLUG}?mes=2026-09`, { [API]: () => json(200, SETEMBRO) }, rotas);
    const anterior = await screen.findByRole('button', { name: 'Mês anterior' });
    expect((anterior as HTMLButtonElement).disabled).toBe(true);
  });

  it('PAR-89: trocar de mês troca o ?mes= e as colunas, com as linhas e a ordem iguais', async () => {
    const t = abrirTela(
      `/g/${SLUG}`,
      {
        [API]: emSequencia(
          () => json(200, ranking()),
          () => json(200, SETEMBRO),
        ),
      },
      rotas,
    );
    await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' });
    const antes = apelidos();
    expect(screen.getByRole('columnheader', { name: '08/10, com chuva' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior, setembro de 2026' }));

    await screen.findByRole('heading', { level: 2, name: 'setembro de 2026' });
    expect(t.local()).toBe(`/g/${SLUG}?mes=2026-09`);
    expect(screen.getByRole('columnheader', { name: '24/09, sem chuva' })).toBeDefined();
    expect(screen.queryByRole('columnheader', { name: '08/10, com chuva' })).toBeNull();
    expect(apelidos()).toEqual(antes);
    const toninho = screen.getByRole('rowheader', { name: 'Toninho' }).closest('tr');
    expect(
      within(toninho as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['1', '26', expect.any(String), '27']);
  });

  it('PAR-81: sem ativos, "Nenhum jogador no ranking ainda." e o texto de ajuda, sem tabela', async () => {
    abrirTela(
      `/g/${SLUG}`,
      {
        [API]: () =>
          json(
            200,
            ranking({
              linhas: [],
              partidas: [],
              resumoMes: { partidas: 0, comChuva: 0 },
              navegacao: { mesAnterior: null, mesSeguinte: null },
            }),
          ),
      },
      rotas,
    );
    expect(
      await screen.findByRole('heading', { name: 'Nenhum jogador no ranking ainda.' }),
    ).toBeDefined();
    expect(
      screen.getByText('Quando o admin cadastrar os jogadores, o ranking aparece aqui.'),
    ).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exportar PDF' })).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Mês anterior' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Mês seguinte' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('PAR-82: carregando pela primeira vez, "Carregando o ranking…"', () => {
    abrirTela(`/g/${SLUG}`, { [API]: () => pendente() }, rotas);
    expect(screen.getByRole('status').textContent).toBe('Carregando o ranking…');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('PAR-161: não há botão nem link "Financeiro" no cabeçalho', async () => {
    abrirTela(`/g/${SLUG}`, { [API]: () => json(200, ranking()) }, rotas);
    await screen.findByRole('heading', { level: 1, name: 'Pelada de Quinta' });
    const cabecalho = screen.getByRole('banner');
    expect(within(cabecalho).queryByRole('link', { name: 'Financeiro' })).toBeNull();
    expect(within(cabecalho).queryByRole('button', { name: 'Financeiro' })).toBeNull();
    expect(within(cabecalho).getByRole('link', { name: 'Área do admin' })).toBeDefined();
  });

  it('P17: 422 de mês fora do histórico volta ao mês de hoje, sem ?mes=, com a faixa da mensagem da API', async () => {
    const t = abrirTela(
      `/g/${SLUG}?mes=2020-01`,
      {
        [API]: emSequencia(
          () =>
            json(422, {
              erro: 'Mês fora do histórico do grupo.',
              codigo: 'dados_invalidos',
              campos: ['mes'],
            }),
          () => json(200, ranking()),
        ),
      },
      rotas,
    );
    expect(await screen.findByText('Mês fora do histórico do grupo.')).toBeDefined();
    await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' });
    expect(t.local()).toBe(`/g/${SLUG}`);
    expect(screen.getByText('Mês fora do histórico do grupo.')).toBeDefined();
    expect(screen.queryByText('Sem conexão')).toBeNull();
    expect(screen.queryByText(/Corrija/)).toBeNull();
  });

  it('falha de rede mostra "Sem conexão" com "Tentar de novo", que consulta de novo', async () => {
    const t = abrirTela(
      `/g/${SLUG}`,
      {
        [API]: emSequencia(
          () => Promise.reject(new TypeError('Failed to fetch')),
          () => json(200, ranking()),
        ),
      },
      rotas,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Sem conexão' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe('Conecte-se para ver o ranking.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' });
    expect(t.chamadasA('GET', `/api/publico/${SLUG}/ranking`)).toHaveLength(2);
  });

  it('PAR-79: axe sem violações', async () => {
    const { container } = abrirTela(`/g/${SLUG}`, { [API]: () => json(200, ranking()) }, rotas);
    await screen.findByRole('table');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'outubro de 2026' })).toBeDefined(),
    );
    await esperarSemViolacoes(container);
  });
});
