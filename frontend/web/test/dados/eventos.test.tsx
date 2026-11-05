import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarCliente } from '../../src/dados/cliente.ts';
import { ProvedorCliente } from '../../src/dados/ContextoCliente.tsx';
import {
  caminhoEventos,
  esquecerAberturas,
  useEnviarPdfExportado,
  useEventoRankingAberto,
} from '../../src/dados/eventos.ts';
import { useMesDaUrl, useRankingPublico } from '../../src/dados/publico.ts';
import {
  CHAVE_DISPOSITIVO,
  idDoAparelho,
} from '../../src/pwa/armazenamento/armazenamento-local.ts';
import { json } from '../apoio/tela.tsx';

/**
 * Identificador anônimo e eventos de uso (partidas-e-ranking T67; PAR-123, PAR-124, PAR-125, PAR-126). O servidor falso
 * registra método, URL e corpo de cada chamada; o `localStorage` do jsdom é limpo entre os testes (P24 de `BC:36`).
 */

const SLUG = 'pelada-de-quinta';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  window.localStorage.clear();
  esquecerAberturas();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function ranking(mes: string) {
  const [ano, m] = mes.split('-').map(Number) as [number, number];
  const anterior = m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`;
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
    navegacao: { mesAnterior: anterior, mesSeguinte: null },
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
  };
}

interface Chamada {
  metodo: string;
  url: string;
  corpo: unknown;
}

type Responder = (metodo: string, url: string) => Response | Promise<Response>;

const padrao: Responder = (metodo, url) => {
  if (metodo === 'POST') return new Response(null, { status: 204 });
  const mes = new URL(url, 'http://local').searchParams.get('mes') ?? '2026-10';
  return json(200, ranking(mes));
};

function montar<T>(hook: () => T, responder: Responder = padrao) {
  const chamadas: Chamada[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const corpo = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    chamadas.push({ metodo, url: String(url), corpo });
    return responder(metodo, String(url));
  }) as unknown as typeof globalThis.fetch;
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const cliente = criarCliente({ consultas, navegar: () => undefined, fetch });
  const envoltorio = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[`/g/${SLUG}`]}>
      <QueryClientProvider client={consultas}>
        <ProvedorCliente cliente={cliente}>{children}</ProvedorCliente>
      </QueryClientProvider>
    </MemoryRouter>
  );
  const eventos = () =>
    chamadas.filter((c) => c.metodo === 'POST' && c.url === caminhoEventos(SLUG));
  return { ...renderHook(hook, { wrapper: envoltorio }), chamadas, eventos };
}

/** O que a página do ranking faz: mês da URL, consulta e o evento de abertura. */
function usePagina() {
  const [mes, trocar] = useMesDaUrl();
  const consulta = useRankingPublico(SLUG, mes);
  useEventoRankingAberto(SLUG, consulta.isSuccess);
  return { mes, trocar, consulta };
}

describe('identificador do aparelho', () => {
  it('PAR-123: o id é UUID v4 e duas aberturas usam o mesmo id', () => {
    const primeiro = idDoAparelho();
    expect(primeiro).toMatch(UUID_V4);
    expect(window.localStorage.getItem(CHAVE_DISPOSITIVO)).toBe(primeiro);
    expect(idDoAparelho()).toBe(primeiro);
  });

  it('PAR-123: id guardado que não é UUID v4 é trocado por um novo', () => {
    window.localStorage.setItem(CHAVE_DISPOSITIVO, 'joao@exemplo.test');
    const id = idDoAparelho();
    expect(id).toMatch(UUID_V4);
    expect(window.localStorage.getItem(CHAVE_DISPOSITIVO)).toBe(id);
  });

  it('PAR-123: duas aberturas da página (carregamentos) mandam o mesmo dispositivoId', async () => {
    const primeira = montar(usePagina);
    await waitFor(() => expect(primeira.eventos()).toHaveLength(1));
    primeira.unmount();
    esquecerAberturas(); // recarregar a página

    const segunda = montar(usePagina);
    await waitFor(() => expect(segunda.eventos()).toHaveLength(1));
    const a = primeira.eventos()[0]?.corpo as { dispositivoId: string };
    const b = segunda.eventos()[0]?.corpo as { dispositivoId: string };
    expect(a.dispositivoId).toMatch(UUID_V4);
    expect(b.dispositivoId).toBe(a.dispositivoId);
  });
});

describe('ranking_aberto', () => {
  it('PAR-124: o ranking carregado envia ranking_aberto com o dispositivoId', async () => {
    const t = montar(usePagina);
    await waitFor(() => expect(t.eventos()).toHaveLength(1));
    expect(t.eventos()[0]?.corpo).toEqual({
      tipo: 'ranking_aberto',
      dispositivoId: idDoAparelho(),
    });
  });

  it('PAR-124: trocar de mês duas vezes não envia outro ranking_aberto', async () => {
    const t = montar(usePagina);
    await waitFor(() => expect(t.result.current.consulta.data?.mes).toBe('2026-10'));
    await waitFor(() => expect(t.eventos()).toHaveLength(1));

    act(() => t.result.current.trocar('2026-09'));
    await waitFor(() => expect(t.result.current.consulta.data?.mes).toBe('2026-09'));
    act(() => t.result.current.trocar('2026-08'));
    await waitFor(() => expect(t.result.current.consulta.data?.mes).toBe('2026-08'));

    expect(t.chamadas.filter((c) => c.metodo === 'GET')).toHaveLength(3);
    expect(t.eventos()).toHaveLength(1);
  });

  it('PAR-124: ranking que não carrega (erro) não envia o evento', async () => {
    const t = montar(usePagina, (metodo) =>
      metodo === 'POST'
        ? new Response(null, { status: 204 })
        : json(404, { erro: 'x', codigo: 'nao_encontrado' }),
    );
    await waitFor(() => expect(t.result.current.consulta.isError).toBe(true));
    expect(t.eventos()).toHaveLength(0);
  });

  it('PAR-126: rede falhando no envio não lança, não mostra nada e não repete o envio', async () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = montar(usePagina, (metodo, url) => {
      if (metodo === 'POST') return Promise.reject(new TypeError('Failed to fetch'));
      return padrao(metodo, url);
    });
    await waitFor(() => expect(t.eventos()).toHaveLength(1));
    act(() => t.result.current.trocar('2026-09'));
    await waitFor(() => expect(t.result.current.consulta.data?.mes).toBe('2026-09'));
    // Espera um pouco além do envio: nenhuma nova tentativa.
    await new Promise((r) => setTimeout(r, 50));
    expect(t.eventos()).toHaveLength(1);
    expect(t.result.current.consulta.isSuccess).toBe(true);
    expect(erros).not.toHaveBeenCalled();
  });

  it('PAR-126: 500 no envio é ignorado, sem nova tentativa', async () => {
    const t = montar(usePagina, (metodo, url) =>
      metodo === 'POST' ? json(500, { erro: 'x', codigo: 'erro_interno' }) : padrao(metodo, url),
    );
    await waitFor(() => expect(t.eventos()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(t.eventos()).toHaveLength(1);
  });
});

describe('pdf_exportado', () => {
  it('PAR-125: envia pdf_exportado com o mês e nunca rejeita, mesmo com a rede falhando', async () => {
    const ok = montar(() => useEnviarPdfExportado(SLUG));
    await ok.result.current('2026-10');
    expect(ok.eventos().map((e) => e.corpo)).toEqual([{ tipo: 'pdf_exportado', mes: '2026-10' }]);

    const falha = montar(
      () => useEnviarPdfExportado(SLUG),
      () => Promise.reject(new TypeError('Failed to fetch')),
    );
    await expect(falha.result.current('2026-09')).resolves.toBeUndefined();
    expect(falha.eventos()).toHaveLength(1);
  });
});
