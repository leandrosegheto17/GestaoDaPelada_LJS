import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { chaveJogador, chaveJogadores } from '../../src/dados/elenco.ts';
import { chaveGrupo } from '../../src/dados/grupos.ts';
import {
  chaveHabilidades,
  exibirNivel,
  useCriarHabilidade,
  useExcluirHabilidade,
  useHabilidades,
  useSalvarNota,
} from '../../src/dados/habilidades.ts';
import { estaInvalidada, montarHook } from '../apoio/dados.tsx';
import { json } from '../apoio/tela.tsx';

/** Habilidades, notas e exibição do nível (grupos-e-elenco T55; GEL-88, GEL-97, GEL-103). */

const G = 'g-quinta';
const J = 'j-toninho';
const HABILIDADES = [
  { id: 'h-visao', nome: 'Visão de Jogo' },
  { id: 'h-passe', nome: 'Passe' },
];
const FICHA = {
  id: J,
  apelido: 'Toninho',
  posicao: 'meia',
  situacao: 'ativo',
  desde: '2026-01-01',
  nivel: 550,
  semNota: true,
  anoNascimento: 1990,
  telefone: null,
  pontuacaoInicial: 0,
  inicioPontuacao: '2026-01-01',
  periodos: [{ id: 'p-1', inicio: '2026-01-01', fim: null }],
  notas: [
    { habilidadeId: 'h-visao', habilidade: 'Visão de Jogo', nota: null },
    { habilidadeId: 'h-passe', habilidade: 'Passe', nota: null },
  ],
};

describe('exibirNivel', () => {
  it.each([
    [683, '6,8'],
    [685, '6,9'],
    [684, '6,8'],
    [550, '5,5'],
    [1000, '10,0'],
    [100, '1,0'],
    [995, '10,0'],
  ])('GEL-103: %i → "%s"', (nivel, texto) => {
    expect(exibirNivel(nivel, false)).toBe(texto);
  });

  it('GEL-103: semNota → "sem nota", qualquer que seja o nível', () => {
    expect(exibirNivel(550, true)).toBe('sem nota');
  });
});

describe('useHabilidades', () => {
  it('GEL-88: devolve as habilidades do grupo na ordem da API', async () => {
    const { result } = montarHook(() => useHabilidades(G), {
      [`GET /api/grupos/${G}/habilidades`]: () => json(200, { habilidades: HABILIDADES }),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.habilidades.map((h) => h.nome)).toEqual(['Visão de Jogo', 'Passe']);
  });

  it('GEL-89: criar invalida a lista de habilidades e o grupo', async () => {
    const m = montarHook(() => useCriarHabilidade(G), {
      [`POST /api/grupos/${G}/habilidades`]: () => json(201, { id: 'h-nova', nome: 'Cabeceio' }),
    });
    m.consultas.setQueryData(chaveHabilidades(G), { habilidades: HABILIDADES });
    m.consultas.setQueryData(chaveGrupo(G), { id: G });
    await act(async () => {
      await m.result.current.mutateAsync({ nome: 'Cabeceio' });
    });
    expect(estaInvalidada(m.consultas, chaveHabilidades(G))).toBe(true);
    expect(estaInvalidada(m.consultas, chaveGrupo(G))).toBe(true);
  });

  it('GEL-93: excluir invalida as fichas e a lista do elenco (o nível muda)', async () => {
    const m = montarHook(() => useExcluirHabilidade(G), {
      [`DELETE /api/grupos/${G}/habilidades/h-passe`]: () => new Response(null, { status: 204 }),
    });
    m.consultas.setQueryData(chaveJogador(G, J), FICHA);
    m.consultas.setQueryData(chaveJogadores(G), { jogadores: [] });
    await act(async () => {
      await m.result.current.mutateAsync('h-passe');
    });
    expect(estaInvalidada(m.consultas, chaveJogador(G, J))).toBe(true);
    expect(estaInvalidada(m.consultas, chaveJogadores(G))).toBe(true);
  });
});

describe('useSalvarNota', () => {
  it('GEL-97: salvar nota atualiza o nível da ficha com a resposta', async () => {
    const m = montarHook(() => useSalvarNota(G, J), {
      [`PUT /api/grupos/${G}/jogadores/${J}/notas/h-passe`]: () => json(200, { nivel: 700, semNota: false }),
    });
    m.consultas.setQueryData(chaveJogador(G, J), FICHA);
    m.consultas.setQueryData(chaveJogadores(G), { jogadores: [] });
    await act(async () => {
      await m.result.current.mutateAsync({ habilidadeId: 'h-passe', nota: 7 });
    });
    expect(m.chamadasA('PUT', `/api/grupos/${G}/jogadores/${J}/notas/h-passe`)[0]?.corpo).toEqual({ nota: 7 });
    const ficha = m.consultas.getQueryData<typeof FICHA>(chaveJogador(G, J));
    expect(ficha?.nivel).toBe(700);
    expect(ficha?.semNota).toBe(false);
    expect(ficha?.notas).toEqual([
      { habilidadeId: 'h-visao', habilidade: 'Visão de Jogo', nota: null },
      { habilidadeId: 'h-passe', habilidade: 'Passe', nota: 7 },
    ]);
    expect(estaInvalidada(m.consultas, chaveJogadores(G))).toBe(true);
  });

  it('GEL-98: apagar a nota (null) volta a ficha a semNota com o nível da resposta', async () => {
    const m = montarHook(() => useSalvarNota(G, J), {
      [`PUT /api/grupos/${G}/jogadores/${J}/notas/h-passe`]: () => json(200, { nivel: 550, semNota: true }),
    });
    m.consultas.setQueryData(chaveJogador(G, J), {
      ...FICHA,
      nivel: 700,
      semNota: false,
      notas: [FICHA.notas[0], { habilidadeId: 'h-passe', habilidade: 'Passe', nota: 7 }],
    });
    await act(async () => {
      await m.result.current.mutateAsync({ habilidadeId: 'h-passe', nota: null });
    });
    const ficha = m.consultas.getQueryData<typeof FICHA>(chaveJogador(G, J));
    expect(ficha?.semNota).toBe(true);
    expect(ficha?.notas[1]?.nota).toBeNull();
  });
});
