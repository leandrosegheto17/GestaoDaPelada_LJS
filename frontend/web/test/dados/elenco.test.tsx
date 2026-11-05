import type { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  chaveJogador,
  chaveJogadores,
  useAlterarInicio,
  useCadastrarJogador,
  useCorrigirPeriodo,
  useExcluirJogador,
  useInativarJogador,
  useJogador,
  useJogadores,
  useReativarJogador,
} from '../../src/dados/elenco.ts';
import { chaveGrupo } from '../../src/dados/grupos.ts';
import { estaInvalidada, montarHook } from '../apoio/dados.tsx';
import { json } from '../apoio/tela.tsx';

/** Dados do elenco no front (grupos-e-elenco T54; GEL-31, GEL-46, GEL-51, GEL-54). */

const G = 'g-quinta';
const J = 'j-toninho';
const BASE = `/api/grupos/${G}/jogadores`;

const ITEM = {
  id: J,
  apelido: 'Toninho',
  posicao: 'meia',
  situacao: 'ativo',
  desde: '2026-01-01',
  nivel: 683,
  semNota: false,
};
const FICHA = {
  ...ITEM,
  anoNascimento: 1990,
  telefone: null,
  pontuacaoInicial: 0,
  inicioPontuacao: '2026-01-01',
  periodos: [{ id: 'p-1', inicio: '2026-01-01', fim: null }],
  notas: [{ habilidadeId: 'h-passe', habilidade: 'Passe', nota: 7 }],
};

function semear(consultas: QueryClient) {
  consultas.setQueryData(chaveJogadores(G), { jogadores: [ITEM] });
  consultas.setQueryData(chaveJogador(G, J), FICHA);
  consultas.setQueryData(chaveJogador(G, 'j-outro'), { ...FICHA, id: 'j-outro' });
  consultas.setQueryData(chaveGrupo(G), { id: G });
}

function invalidadas(consultas: QueryClient) {
  return {
    lista: estaInvalidada(consultas, chaveJogadores(G)),
    ficha: estaInvalidada(consultas, chaveJogador(G, J)),
    grupo: estaInvalidada(consultas, chaveGrupo(G)),
    outra: estaInvalidada(consultas, chaveJogador(G, 'j-outro')),
  };
}

describe('useJogadores e useJogador', () => {
  it('GEL-46: a lista chega tipada pelo jogadorItem', async () => {
    const { result } = montarHook(() => useJogadores(G), {
      [`GET ${BASE}`]: () => json(200, { jogadores: [ITEM] }),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.jogadores[0]).toEqual(ITEM);
  });

  it('GEL-46: item fora do jogadorItem (campo a mais) é erro, não dado', async () => {
    const { result } = montarHook(() => useJogadores(G), {
      [`GET ${BASE}`]: () => json(200, { jogadores: [{ ...ITEM, telefone: '11987654321' }] }),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('GEL-46: useJogador lê a ficha', async () => {
    const { result } = montarHook(() => useJogador(G, J), {
      [`GET ${BASE}/${J}`]: () => json(200, FICHA),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.periodos).toHaveLength(1);
  });
});

describe('mutações do elenco', () => {
  it('GEL-31: cadastrar faz POST, guarda a ficha e invalida a lista e o grupo', async () => {
    const m = montarHook(() => useCadastrarJogador(G), {
      [`POST ${BASE}`]: () => json(201, { ...FICHA, id: 'j-novo' }),
    });
    semear(m.consultas);
    await act(async () => {
      await m.result.current.mutateAsync({
        apelido: 'Novo',
        anoNascimento: 1990,
        posicao: 'meia',
        telefone: null,
        pontuacaoInicial: 0,
      });
    });
    expect(m.consultas.getQueryData(chaveJogador(G, 'j-novo'))).toMatchObject({ id: 'j-novo' });
    expect(invalidadas(m.consultas)).toMatchObject({ lista: true, grupo: true, outra: false });
  });

  it('GEL-51: inativar invalida a lista e a ficha do jogador', async () => {
    const m = montarHook(() => useInativarJogador(G, J), {
      [`POST ${BASE}/${J}/inativar`]: () => json(200, { alterado: true }),
    });
    semear(m.consultas);
    await act(async () => {
      await m.result.current.mutateAsync({ data: '2026-10-01' });
    });
    expect(m.chamadasA('POST', `${BASE}/${J}/inativar`)[0]?.corpo).toEqual({ data: '2026-10-01' });
    expect(invalidadas(m.consultas)).toEqual({
      lista: true,
      ficha: true,
      grupo: true,
      outra: false,
    });
  });

  it('GEL-53: inativar recusado (409) não invalida nada', async () => {
    const m = montarHook(() => useInativarJogador(G, J), {
      [`POST ${BASE}/${J}/inativar`]: () =>
        json(409, { erro: 'O jogador já está inativo.', codigo: 'ja_inativo' }),
    });
    semear(m.consultas);
    await act(async () => {
      await m.result.current.mutateAsync({}).catch(() => undefined);
    });
    expect(invalidadas(m.consultas)).toEqual({
      lista: false,
      ficha: false,
      grupo: false,
      outra: false,
    });
  });

  it('GEL-54: reativar invalida a lista e a ficha do jogador', async () => {
    const m = montarHook(() => useReativarJogador(G, J), {
      [`POST ${BASE}/${J}/reativar`]: () => json(200, { alterado: true }),
    });
    semear(m.consultas);
    await act(async () => {
      await m.result.current.mutateAsync({});
    });
    expect(invalidadas(m.consultas)).toMatchObject({ lista: true, ficha: true });
  });

  it('GEL-71: corrigir período faz PATCH no período e invalida a ficha', async () => {
    const m = montarHook(() => useCorrigirPeriodo(G, J), {
      [`PATCH ${BASE}/${J}/periodos/p-1`]: () => json(200, { alterado: true, periodos: [] }),
    });
    semear(m.consultas);
    await act(async () => {
      await m.result.current.mutateAsync({ periodoId: 'p-1', dados: { saida: '2026-10-03' } });
    });
    expect(m.chamadasA('PATCH', `${BASE}/${J}/periodos/p-1`)[0]?.corpo).toEqual({
      saida: '2026-10-03',
    });
    expect(invalidadas(m.consultas)).toMatchObject({ lista: true, ficha: true });
  });

  it('GEL-77: alterar início faz PUT e invalida a ficha', async () => {
    const m = montarHook(() => useAlterarInicio(G, J), {
      [`PUT ${BASE}/${J}/inicio`]: () => json(200, { alterado: true, periodos: [] }),
    });
    semear(m.consultas);
    await act(async () => {
      await m.result.current.mutateAsync({ data: '2025-12-01' });
    });
    expect(invalidadas(m.consultas)).toMatchObject({ ficha: true });
  });

  it('GEL-84: excluir tira a ficha do cache e invalida a lista', async () => {
    const m = montarHook(() => useExcluirJogador(G, J), {
      [`DELETE ${BASE}/${J}`]: () => new Response(null, { status: 204 }),
    });
    semear(m.consultas);
    await act(async () => {
      await m.result.current.mutateAsync();
    });
    expect(m.consultas.getQueryData(chaveJogador(G, J))).toBeUndefined();
    expect(estaInvalidada(m.consultas, chaveJogadores(G))).toBe(true);
  });
});
