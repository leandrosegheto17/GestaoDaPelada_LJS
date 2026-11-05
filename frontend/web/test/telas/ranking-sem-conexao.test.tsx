import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chaveRanking, guardarRanking } from '../../src/pwa/armazenamento/ranking-guardado.ts';
import { textoAtualizadoEm } from '../../src/telas/ranking/FaixaSemConexao.tsx';
import { PaginaRanking } from '../../src/telas/ranking/PaginaRanking.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, type Manipulador } from '../apoio/tela.tsx';

/**
 * Ranking sem conexão (partidas-e-ranking T73; PAR-149 a PAR-152), de
 * `t01-ranking--{sem-conexao,sem-conexao-admin,carregando-cache,erro}.html`. Sem rede = o `fetch` rejeita (status 0
 * no cliente). O `localStorage` é limpo depois de cada teste (`apoio/limpar-armazenamento.ts`).
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SLUG = 'pelada-de-quinta';
const API = `GET /api/publico/${SLUG}/ranking`;
const rotas = () => [{ path: '/g/:slug', element: <PaginaRanking />, handle: { tela: 'ranking' } }];

function ranking(mes = '2026-10', extra: Record<string, unknown> = {}) {
  return {
    grupo: {
      nome: 'Pelada de Quinta',
      slug: SLUG,
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '20:00',
    },
    mes,
    hoje: '2026-10-22',
    geradoEm: '2026-10-16T01:30:00.000Z',
    navegacao: { mesAnterior: '2026-09', mesSeguinte: null },
    resumoMes: { partidas: 1, comChuva: 0 },
    partidas: [{ data: `${mes}-15`, choveu: false }],
    linhas: [
      {
        posicao: 1,
        apelido: 'Toninho',
        ptsInicial: 27,
        rodadas: [{ situacao: 'presente', pontos: 1 }],
        ptsFinal: 28,
      },
    ],
    ...extra,
  };
}

const semRede: Manipulador = () => Promise.reject(new TypeError('Failed to fetch'));

function guardar(mesPedido: string | undefined, dados = ranking()) {
  guardarRanking(SLUG, mesPedido, dados as never);
}

describe('com o ranking guardado', () => {
  it('PAR-149: geradoEm 2026-10-16T01:30Z mostra "atualizado em 15/10 22:30"', () => {
    expect(textoAtualizadoEm('2026-10-16T01:30:00.000Z')).toBe(
      'Sem conexão, atualizado em 15/10 22:30',
    );
    expect(textoAtualizadoEm('2026-10-22T21:40:00Z')).toBe(
      'Sem conexão, atualizado em 22/10 18:40',
    );
  });

  it('PAR-149: sem rede, mostra o guardado com a faixa e somente leitura (sem "Exportar PDF")', async () => {
    guardar(undefined);
    abrirTela(`/g/${SLUG}`, { [API]: semRede }, rotas);
    expect(await screen.findByText('Sem conexão, atualizado em 15/10 22:30')).toBeDefined();
    expect(screen.getByRole('heading', { level: 1, name: 'Pelada de Quinta' })).toBeDefined();
    expect(screen.getByRole('rowheader', { name: 'Toninho' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Exportar PDF' })).toBeNull();
    expect(screen.queryByText('Conecte-se para ver o ranking.')).toBeNull();
  });

  it('PAR-149: navegador sem rede com o ranking vindo do cache do service worker (200) também mostra a faixa', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    abrirTela(`/g/${SLUG}`, { [API]: () => json(200, ranking()) }, rotas);
    expect(await screen.findByText('Sem conexão, atualizado em 15/10 22:30')).toBeDefined();
    expect(screen.getByRole('rowheader', { name: 'Toninho' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Exportar PDF' })).toBeNull();
  });

  it('PAR-149: a rede voltando (evento online) tira a faixa', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    abrirTela(`/g/${SLUG}`, { [API]: () => json(200, ranking()) }, rotas);
    await screen.findByText('Sem conexão, atualizado em 15/10 22:30');
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(screen.queryByText(/Sem conexão, atualizado em/)).toBeNull());
    expect(screen.getAllByRole('button', { name: 'Exportar PDF' }).length).toBeGreaterThan(0);
  });

  it('PAR-149: o guardado é o do mês pedido; outro mês guardado não serve', async () => {
    guardar('2026-09', ranking('2026-09'));
    abrirTela(`/g/${SLUG}?mes=2026-09`, { [API]: semRede }, rotas);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'setembro de 2026' }),
    ).toBeDefined();
    expect(screen.getByText('Sem conexão, atualizado em 15/10 22:30')).toBeDefined();
    cleanup();

    abrirTela(`/g/${SLUG}?mes=2026-08`, { [API]: semRede }, rotas);
    expect(await screen.findByText('Conecte-se para ver o ranking.')).toBeDefined();
  });

  it('PAR-149: erro do servidor (500) não usa o guardado', async () => {
    guardar(undefined);
    abrirTela(
      `/g/${SLUG}`,
      { [API]: () => json(500, { erro: 'x', codigo: 'erro_interno' }) },
      rotas,
    );
    expect(await screen.findByText('Conecte-se para ver o ranking.')).toBeDefined();
    expect(screen.queryByText(/atualizado em/)).toBeNull();
  });

  it('PAR-150: tocar na engrenagem sem rede mostra a mensagem e não navega', async () => {
    guardar(undefined);
    const t = abrirTela(`/g/${SLUG}`, { [API]: semRede }, rotas);
    await screen.findByText('Sem conexão, atualizado em 15/10 22:30');
    const engrenagem = within(screen.getByRole('banner')).getByRole('link', {
      name: 'Área do admin',
    });
    const clique = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(engrenagem, clique);
    expect(clique.defaultPrevented).toBe(true);
    expect((await screen.findByRole('alert')).textContent).toBe('É preciso conexão para entrar.');
    expect(t.local()).toBe(`/g/${SLUG}`);
  });

  it('PAR-150: também na tela sem guardado', async () => {
    abrirTela(`/g/${SLUG}`, { [API]: semRede }, rotas);
    await screen.findByText('Conecte-se para ver o ranking.');
    const clique = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(
      within(screen.getByRole('banner')).getByRole('link', { name: 'Área do admin' }),
      clique,
    );
    expect(clique.defaultPrevented).toBe(true);
    expect(await screen.findByText('É preciso conexão para entrar.')).toBeDefined();
  });

  it('PAR-150: com rede, a engrenagem segue o link', async () => {
    abrirTela(`/g/${SLUG}`, { [API]: () => json(200, ranking()) }, rotas);
    await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' });
    const clique = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(
      within(screen.getByRole('banner')).getByRole('link', { name: 'Área do admin' }),
      clique,
    );
    expect(screen.queryByText('É preciso conexão para entrar.')).toBeNull();
  });

  it('PAR-152: com guardado e a rede ainda respondendo, mostra o guardado com "atualizando…"', async () => {
    guardar(undefined);
    abrirTela(`/g/${SLUG}`, { [API]: () => pendente() }, rotas);
    expect(await screen.findByText('atualizando…')).toBeDefined();
    expect(screen.getByRole('rowheader', { name: 'Toninho' })).toBeDefined();
    expect(screen.queryByText(/Sem conexão/)).toBeNull();
  });

  it('PAR-152: a rede respondendo troca pelos dados novos e o "atualizando…" some', async () => {
    guardar(undefined);
    let responder: (r: Response) => void = () => undefined;
    const novo = ranking('2026-10', {
      linhas: [
        {
          posicao: 1,
          apelido: 'Bigode',
          ptsInicial: 26,
          rodadas: [{ situacao: 'presente', pontos: 2 }],
          ptsFinal: 28,
        },
      ],
    });
    abrirTela(`/g/${SLUG}`, { [API]: () => new Promise<Response>((r) => (responder = r)) }, rotas);
    await screen.findByText('atualizando…');
    expect(screen.getByRole('rowheader', { name: 'Toninho' })).toBeDefined();
    responder(json(200, novo));
    expect(await screen.findByRole('rowheader', { name: 'Bigode' })).toBeDefined();
    await waitFor(() => expect(screen.queryByText('atualizando…')).toBeNull());
    expect(screen.queryByRole('rowheader', { name: 'Toninho' })).toBeNull();
  });
});

describe('sem guardado', () => {
  it('PAR-151: sem guardado, o vazio sem conexão com "Tentar de novo"', async () => {
    expect(window.localStorage.getItem(chaveRanking(SLUG, undefined))).toBeNull();
    const { container } = abrirTela(`/g/${SLUG}`, { [API]: semRede }, rotas);
    expect(await screen.findByRole('heading', { level: 1, name: 'Sem conexão' })).toBeDefined();
    expect(screen.getByText('Conecte-se para ver o ranking.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeDefined();
    await esperarSemViolacoes(container);
  });

  it('PAR-151: guardado inválido conta como sem guardado', async () => {
    window.localStorage.setItem(
      chaveRanking(SLUG, undefined),
      JSON.stringify(ranking('2026-10', { telefone: '1' })),
    );
    abrirTela(`/g/${SLUG}`, { [API]: semRede }, rotas);
    expect(await screen.findByText('Conecte-se para ver o ranking.')).toBeDefined();
    expect(window.localStorage.getItem(chaveRanking(SLUG, undefined))).toBeNull();
  });
});
