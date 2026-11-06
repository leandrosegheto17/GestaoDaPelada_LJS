import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { criarCliente } from '../../src/dados/cliente.ts';
import { ProvedorCliente } from '../../src/dados/ContextoCliente.tsx';
import {
  caminhoPdfPublico,
  caminhoRankingPublico,
  chaveRankingPublico,
  ehMesValido,
  useBuscarPdfPublico,
  useMesDaUrl,
  useRankingPublico,
} from '../../src/dados/publico.ts';
import { json } from '../apoio/tela.tsx';

/**
 * Dados do ranking público (partidas-e-ranking T54; PAR-65, PAR-89). O servidor falso registra a URL inteira (com o
 * `?mes=`), porque o `montarHook` de `apoio/dados.tsx` a corta; o roteador é um `MemoryRouter` com a URL inicial.
 */

const SLUG = 'pelada-de-quinta';

function ranking(mes: string, extra: Record<string, unknown> = {}) {
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
    geradoEm: '2026-10-22T12:00:00.000Z',
    pdfLiberado: true,
    navegacao: { mesAnterior: '2026-09', mesSeguinte: null },
    resumoMes: { partidas: 1, comChuva: 0 },
    partidas: [{ data: `${mes}-15`, choveu: false }],
    linhas: [
      {
        posicao: 1,
        apelido: 'Beto',
        ptsInicial: 3,
        rodadas: [{ situacao: 'presente', pontos: 1 }],
        ptsFinal: 4,
      },
    ],
    ...extra,
  };
}

const PDF = {
  grupo: { nome: 'Pelada de Quinta', slug: SLUG },
  mes: '2026-10',
  geradoEm: '2026-10-22T12:00:00.000Z',
  urlPublica: 'https://gestaodapelada-v2.exemplo.test/g/pelada-de-quinta',
  semPartidasNoMes: false,
  colunas: [{ data: '2026-10-15', choveu: false, doMesExibido: true }],
  linhas: [
    {
      posicao: 1,
      apelido: 'Beto',
      ptsInicial: 3,
      rodadas: [{ situacao: 'presente', pontos: 1 }],
      ptsFinal: 4,
    },
  ],
};

type Resposta = (url: string) => Response;

function montar<T>(hook: () => T, responder: Resposta, inicial: string | string[] = `/g/${SLUG}`) {
  const entradas = Array.isArray(inicial) ? inicial : [inicial];
  const urls: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return responder(String(url));
  }) as unknown as typeof globalThis.fetch;
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const cliente = criarCliente({ consultas, navegar: () => undefined, fetch });
  const envoltorio = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={entradas} initialIndex={entradas.length - 1}>
      <QueryClientProvider client={consultas}>
        <ProvedorCliente cliente={cliente}>{children}</ProvedorCliente>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { ...renderHook(hook, { wrapper: envoltorio }), urls, consultas };
}

/** O hook da página: mês da URL, consulta do mês e a localização (para ver o `?mes=`). */
function usePagina() {
  const [mes, trocar] = useMesDaUrl();
  const consulta = useRankingPublico(SLUG, mes);
  const local = useLocation();
  return { mes, trocar, consulta, busca: local.search };
}

const porMes: Resposta = (url) => {
  const mes = new URL(url, 'http://local').searchParams.get('mes') ?? '2026-10';
  return json(200, ranking(mes));
};

describe('caminhos', () => {
  it('PAR-65: sem mês, sem ?mes=; com mês, ?mes= codificado; slug codificado', () => {
    expect(caminhoRankingPublico(SLUG)).toBe(`/api/publico/${SLUG}/ranking`);
    expect(caminhoRankingPublico(SLUG, '2026-07')).toBe(`/api/publico/${SLUG}/ranking?mes=2026-07`);
    expect(caminhoPdfPublico(SLUG, '2026-07')).toBe(`/api/publico/${SLUG}/pdf?mes=2026-07`);
    expect(caminhoRankingPublico('a b', 'x&y')).toBe('/api/publico/a%20b/ranking?mes=x%26y');
  });

  it('PAR-65: ehMesValido aceita AAAA-MM e recusa o resto', () => {
    expect(ehMesValido('2026-07')).toBe(true);
    expect(ehMesValido('2026-13')).toBe(false);
    expect(ehMesValido('julho')).toBe(false);
    expect(ehMesValido(undefined)).toBe(false);
  });
});

describe('useRankingPublico', () => {
  it('PAR-65: sem ?mes= na URL, lê o mês de hoje (sem parâmetro)', async () => {
    const { result, urls } = montar(usePagina, porMes);
    await waitFor(() => expect(result.current.consulta.isSuccess).toBe(true));
    expect(result.current.mes).toBeUndefined();
    expect(urls).toEqual([`/api/publico/${SLUG}/ranking`]);
  });

  it('PAR-65: ?mes= da URL vai para a API', async () => {
    const { result, urls } = montar(usePagina, porMes, `/g/${SLUG}?mes=2026-07`);
    await waitFor(() => expect(result.current.consulta.isSuccess).toBe(true));
    expect(result.current.mes).toBe('2026-07');
    expect(urls).toEqual([`/api/publico/${SLUG}/ranking?mes=2026-07`]);
    expect(result.current.consulta.data?.mes).toBe('2026-07');
  });

  it('resposta fora do contrato vira erro, não dado (campo proibido jogadorId)', async () => {
    const { result } = montar(
      () => useRankingPublico(SLUG),
      () =>
        json(
          200,
          ranking('2026-10', {
            linhas: [
              {
                posicao: 1,
                apelido: 'Beto',
                jogadorId: 'x',
                ptsInicial: 0,
                rodadas: [{ situacao: 'presente', pontos: 1 }],
                ptsFinal: 1,
              },
            ],
          }),
        ),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('resposta fora do contrato vira erro, não dado (linha sem uma rodada por partida)', async () => {
    const { result } = montar(
      () => useRankingPublico(SLUG),
      () => json(200, ranking('2026-10', { partidas: [] })),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('PAR-65: 422 "Mês inválido." chega como erro da consulta, com a mensagem da API', async () => {
    const { result } = montar(
      usePagina,
      () => json(422, { erro: 'Mês inválido.', codigo: 'dados_invalidos', campos: ['mes'] }),
      `/g/${SLUG}?mes=julho`,
    );
    await waitFor(() => expect(result.current.consulta.isError).toBe(true));
    expect(result.current.consulta.error?.message).toBe('Mês inválido.');
  });

  it('slug vazio não consulta', () => {
    const { result, urls } = montar(() => useRankingPublico(''), porMes);
    expect(result.current.fetchStatus).toBe('idle');
    expect(urls).toEqual([]);
  });
});

describe('useMesDaUrl', () => {
  it('PAR-89: trocar de mês altera o ?mes= e refaz a consulta só uma vez', async () => {
    const { result, urls } = montar(usePagina, porMes);
    await waitFor(() => expect(result.current.consulta.isSuccess).toBe(true));
    expect(urls).toHaveLength(1);

    act(() => result.current.trocar('2026-09'));

    await waitFor(() => expect(result.current.consulta.data?.mes).toBe('2026-09'));
    expect(result.current.busca).toBe('?mes=2026-09');
    expect(result.current.mes).toBe('2026-09');
    expect(urls).toEqual([
      `/api/publico/${SLUG}/ranking`,
      `/api/publico/${SLUG}/ranking?mes=2026-09`,
    ]);
  });

  it('PAR-89: a troca substitui a entrada da história: voltar sai da página, não vai ao mês anterior', async () => {
    const { result } = montar(
      () => ({ ...usePagina(), navegar: useNavigate(), caminho: useLocation().pathname }),
      porMes,
      ['/app', `/g/${SLUG}`],
    );
    await waitFor(() => expect(result.current.consulta.isSuccess).toBe(true));
    act(() => result.current.trocar('2026-09'));
    await waitFor(() => expect(result.current.busca).toBe('?mes=2026-09'));
    act(() => result.current.trocar('2026-08'));
    await waitFor(() => expect(result.current.busca).toBe('?mes=2026-08'));
    act(() => {
      void result.current.navegar(-1);
    });
    await waitFor(() => expect(result.current.caminho).toBe('/app'));
  });

  it('PAR-89: trocar para null tira o ?mes= e volta ao mês de hoje', async () => {
    const { result, urls } = montar(usePagina, porMes, `/g/${SLUG}?mes=2026-07`);
    await waitFor(() => expect(result.current.consulta.isSuccess).toBe(true));
    act(() => result.current.trocar(null));
    await waitFor(() => expect(result.current.busca).toBe(''));
    expect(result.current.mes).toBeUndefined();
    await waitFor(() => expect(urls).toContain(`/api/publico/${SLUG}/ranking`));
  });

  it('PAR-89: cada mês tem a própria chave de consulta', async () => {
    const { result, consultas } = montar(usePagina, porMes);
    await waitFor(() => expect(result.current.consulta.isSuccess).toBe(true));
    act(() => result.current.trocar('2026-09'));
    await waitFor(() => expect(result.current.consulta.data?.mes).toBe('2026-09'));
    expect(consultas.getQueryData<{ mes: string }>(chaveRankingPublico(SLUG, undefined))?.mes).toBe(
      '2026-10',
    );
    expect(consultas.getQueryData<{ mes: string }>(chaveRankingPublico(SLUG, '2026-09'))?.mes).toBe(
      '2026-09',
    );
  });
});

describe('useBuscarPdfPublico', () => {
  it('PAR-102: lê a projeção do PDF do mês pedido, só quando chamada', async () => {
    const { result, urls } = montar(
      () => useBuscarPdfPublico(SLUG),
      () => json(200, PDF),
    );
    expect(urls).toEqual([]);
    let pdf: unknown;
    await act(async () => {
      pdf = await result.current('2026-10');
    });
    expect(urls).toEqual([`/api/publico/${SLUG}/pdf?mes=2026-10`]);
    expect(pdf).toMatchObject({ mes: '2026-10', semPartidasNoMes: false });
  });

  it('PAR-102: projeção do PDF fora do contrato (13 colunas) é recusada', async () => {
    const colunas = Array.from({ length: 13 }, (_, i) => ({
      data: `2026-10-${String(i + 1).padStart(2, '0')}`,
      choveu: false,
      doMesExibido: true,
    }));
    const { result } = montar(
      () => useBuscarPdfPublico(SLUG),
      () => json(200, { ...PDF, colunas, linhas: [] }),
    );
    await expect(result.current('2026-10')).rejects.toThrow();
  });
});
