// Critério: T54 (GEL-46, GEL-118): cada mutação do elenco chama a rota certa e invalida a lista e a ficha; o 409
// `jogador_com_historico` chega com a sugestão `inativar` (GEL-85).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { corpoEnviado, erroApi, json, simularApi } from '../../test/apoio/tela';
import {
  chavesElenco,
  recusaPorHistorico,
  useAlterarInicio,
  useCorrigirPeriodo,
  useCriarJogador,
  useEditarJogador,
  useExcluirJogador,
  useInativarJogador,
  useJogador,
  useJogadores,
  useReativarJogador,
} from './elenco';
import { chaveGrupo } from './grupos';

afterEach(() => vi.unstubAllGlobals());

const ITEM = {
  id: 'j1',
  apelido: 'Toninho',
  posicao: 'meia',
  situacao: 'ativo',
  desde: '2026-10-01',
  nivel: 550,
  semNota: true,
};
const FICHA = {
  ...ITEM,
  anoNascimento: 1990,
  telefone: null,
  pontuacaoInicial: 0,
  inicioPontuacao: '2026-10-01',
  periodos: [{ id: 'p1', inicio: '2026-10-01', fim: null }],
  notas: [],
};
const PERIODOS = { alterado: true, periodos: [{ id: 'p1', inicio: '2026-09-01', fim: null }] };
const NOVO = { apelido: 'Toninho', anoNascimento: 1990, posicao: 'meia', telefone: null, dataEntrada: '2026-10-01' };

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const chave of [
    chaveGrupo('g1'),
    chavesElenco.lista('g1'),
    chavesElenco.detalhe('g1', 'j1'),
    chaveGrupo('g2'),
  ]) {
    cliente.setQueryData(chave, { x: 1 });
  }
  const envolver = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
  return { cliente, envolver };
}

const invalidada = (c: QueryClient, chave: readonly unknown[]) => c.getQueryState(chave)?.isInvalidated;

const chamada = (f: ReturnType<typeof simularApi>, i = 0) => {
  const [url, init] = f.mock.calls[i]!;
  return `${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`;
};

function esperaInvalidarElenco(cliente: QueryClient) {
  return waitFor(() => {
    expect(invalidada(cliente, chavesElenco.lista('g1'))).toBe(true);
    expect(invalidada(cliente, chavesElenco.detalhe('g1', 'j1'))).toBe(true);
    expect(invalidada(cliente, chaveGrupo('g1'))).toBe(true);
  });
}

describe('leituras do elenco', () => {
  it('useJogadores lê GET …/jogadores', async () => {
    const f = simularApi(() => json({ jogadores: [ITEM] }));
    const { envolver } = montar();
    const { result } = renderHook(() => useJogadores('g1'), { wrapper: envolver });
    await waitFor(() => expect(result.current.data).toEqual({ jogadores: [ITEM] }));
    expect(chamada(f)).toBe('GET /api/grupos/g1/jogadores');
  });

  it('useJogador lê GET …/jogadores/:id', async () => {
    const f = simularApi(() => json(FICHA));
    const { envolver } = montar();
    const { result } = renderHook(() => useJogador('g1', 'j1'), { wrapper: envolver });
    await waitFor(() => expect(result.current.data).toEqual(FICHA));
    expect(chamada(f)).toBe('GET /api/grupos/g1/jogadores/j1');
  });
});

describe('mutações do elenco: rota, corpo e invalidação da lista e da ficha', () => {
  it.each([
    ['criar', 'POST /api/grupos/g1/jogadores', FICHA, NOVO, () => useCriarJogador('g1')],
    [
      'editar',
      'PATCH /api/grupos/g1/jogadores/j1',
      FICHA,
      { apelido: 'Toninho', anoNascimento: 1990, posicao: 'meia', telefone: null, pontuacaoInicial: 5 },
      () => useEditarJogador('g1', 'j1'),
    ],
    [
      'inativar',
      'POST /api/grupos/g1/jogadores/j1/inativar',
      FICHA,
      { data: '2026-10-20' },
      () => useInativarJogador('g1', 'j1'),
    ],
    ['reativar sem data', 'POST /api/grupos/g1/jogadores/j1/reativar', FICHA, {}, () => useReativarJogador('g1', 'j1')],
    [
      'alterar início',
      'PUT /api/grupos/g1/jogadores/j1/inicio',
      FICHA,
      { data: '2026-09-01' },
      () => useAlterarInicio('g1', 'j1'),
    ],
  ] as const)('%s', async (_nome, rota, resposta, corpo, hook) => {
    const f = simularApi(() => json(resposta));
    const { cliente, envolver } = montar();
    const { result } = renderHook(hook as () => { mutate: (c: unknown) => void }, { wrapper: envolver });
    result.current.mutate(corpo);
    await esperaInvalidarElenco(cliente);
    expect(chamada(f)).toBe(rota);
    expect(corpoEnviado(f)).toEqual(corpo);
    expect(invalidada(cliente, chaveGrupo('g2'))).toBe(false);
  });

  it('corrigir período: PATCH …/periodos/:periodoId só com as datas no corpo', async () => {
    const f = simularApi(() => json(PERIODOS));
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useCorrigirPeriodo('g1', 'j1'), { wrapper: envolver });
    result.current.mutate({ periodoId: 'p1', retorno: '2026-09-01' });
    await esperaInvalidarElenco(cliente);
    expect(chamada(f)).toBe('PATCH /api/grupos/g1/jogadores/j1/periodos/p1');
    expect(corpoEnviado(f)).toEqual({ retorno: '2026-09-01' });
  });

  it('excluir: DELETE …/jogadores/:id (204) e invalida', async () => {
    const f = simularApi(() => new Response(null, { status: 204 }));
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useExcluirJogador('g1', 'j1'), { wrapper: envolver });
    result.current.mutate();
    await esperaInvalidarElenco(cliente);
    expect(chamada(f)).toBe('DELETE /api/grupos/g1/jogadores/j1');
    expect(corpoEnviado(f)).toBeUndefined();
  });
});

describe('exclusão recusada por histórico (GEL-85)', () => {
  it('o 409 jogador_com_historico chega com a mensagem e a sugestão inativar; nada é invalidado', async () => {
    simularApi(() =>
      json(
        {
          erro: {
            codigo: 'jogador_com_historico',
            mensagem: 'Toninho tem histórico de partidas e não pode ser excluído.',
            sugestao: 'inativar',
          },
        },
        409,
      ),
    );
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useExcluirJogador('g1', 'j1'), { wrapper: envolver });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(recusaPorHistorico(result.current.error)).toEqual({
      mensagem: 'Toninho tem histórico de partidas e não pode ser excluído.',
      sugestao: 'inativar',
    });
    expect(invalidada(cliente, chavesElenco.lista('g1'))).toBe(false);
  });

  it('outros erros não são recusa por histórico', () => {
    expect(recusaPorHistorico(new Error('x'))).toBeNull();
  });

  it('409 de outro código também não', async () => {
    simularApi(() => erroApi(409, 'grupo_arquivado'));
    const { envolver } = montar();
    const { result } = renderHook(() => useExcluirJogador('g1', 'j1'), { wrapper: envolver });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(recusaPorHistorico(result.current.error)).toBeNull();
  });
});
