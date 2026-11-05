import type { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHAVE_SESSAO } from '../../src/app/guarda.tsx';
import {
  CHAVE_GRUPOS,
  chaveGrupo,
  useArquivarGrupo,
  useCriarGrupo,
  useEditarGrupo,
  useGrupo,
  useGrupos,
  useReativarGrupo,
} from '../../src/dados/grupos.ts';
import { estaInvalidada, montarHook } from '../apoio/dados.tsx';
import { json } from '../apoio/tela.tsx';

/** Dados de grupos no front (grupos-e-elenco T53; GEL-01, GEL-18, GEL-22, GEL-27). */

const QUINTA = { id: 'g-quinta', nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' };
const VELHA = { id: 'g-velha', nome: 'Pelada Velha', slug: 'pelada-velha', diaSemana: 'sabado', frequencia: 'mensal', horario: '09:00' };
const DETALHE = {
  ...QUINTA,
  linkPublico: 'https://pelada.exemplo.test/g/pelada-de-quinta',
  jogadoresAtivos: 12,
  habilidades: 6,
  admins: 2,
  souCriador: true,
  // Campos do início (PAR-132) e do simulador (SIM-08) da forma do GET (partidas-e-ranking T64): só preparação.
  dataSugeridaPartida: '2026-10-22',
  partidaNaDataSugerida: false,
  partidasNoMes: 3,
  pesosVigentesDesde: '2026-09-01',
  pesosPadrao: false,
  aparelhosNaSemana: 12,
  proximoDiaDeJogo: '2026-10-22',
  escalacaoNoProximoDia: false,
};
const DADOS = { nome: 'Pelada de Quinta', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' } as const;

/** Põe a lista, o grupo e a sessão no cache, para ver quais a mutação invalida. */
function semear(consultas: QueryClient) {
  consultas.setQueryData(CHAVE_GRUPOS, { ativos: [QUINTA], arquivados: [] });
  consultas.setQueryData(chaveGrupo('g-quinta'), DETALHE);
  consultas.setQueryData(chaveGrupo('g-outro'), { ...DETALHE, id: 'g-outro' });
  consultas.setQueryData(CHAVE_SESSAO, { tipo: 'ausente' });
}

describe('useGrupos e useGrupo', () => {
  it('GEL-27: useGrupos devolve ativos e arquivados de GET /api/grupos', async () => {
    const { result } = montarHook(() => useGrupos(), {
      'GET /api/grupos': () => json(200, { ativos: [QUINTA], arquivados: [VELHA] }),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ ativos: [QUINTA], arquivados: [VELHA] });
  });

  it('GEL-27: resposta fora do contrato é erro, não dado', async () => {
    const { result } = montarHook(() => useGrupos(), { 'GET /api/grupos': () => json(200, { ativos: 'x' }) });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('GEL-20: useGrupo lê o detalhe do grupo', async () => {
    const { result } = montarHook(() => useGrupo('g-quinta'), { 'GET /api/grupos/g-quinta': () => json(200, DETALHE) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.souCriador).toBe(true);
  });
});

describe('mutações de grupo', () => {
  it('GEL-01: criarGrupo faz POST /api/grupos e invalida a lista e a sessão', async () => {
    const m = montarHook(() => useCriarGrupo(), {
      'POST /api/grupos': () => json(201, { id: 'g-novo', slug: 'pelada-de-quinta-2', linkPublico: 'https://x/g/y' }),
    });
    semear(m.consultas);
    let resposta: unknown;
    await act(async () => {
      resposta = await m.result.current.mutateAsync(DADOS);
    });
    expect(resposta).toMatchObject({ id: 'g-novo' });
    expect(m.chamadasA('POST', '/api/grupos')[0]?.corpo).toEqual(DADOS);
    expect(estaInvalidada(m.consultas, CHAVE_GRUPOS)).toBe(true);
    expect(estaInvalidada(m.consultas, CHAVE_SESSAO)).toBe(true);
    expect(estaInvalidada(m.consultas, chaveGrupo('g-outro'))).toBe(false);
  });

  it('GEL-18: editarGrupo faz PATCH, guarda o detalhe novo e invalida a lista e a sessão', async () => {
    const novo = { ...DETALHE, nome: 'Pelada Renomeada' };
    const m = montarHook(() => useEditarGrupo('g-quinta'), { 'PATCH /api/grupos/g-quinta': () => json(200, novo) });
    semear(m.consultas);
    await act(async () => {
      await m.result.current.mutateAsync({ ...DADOS, nome: 'Pelada Renomeada' });
    });
    expect(m.consultas.getQueryData(chaveGrupo('g-quinta'))).toMatchObject({ nome: 'Pelada Renomeada' });
    expect(estaInvalidada(m.consultas, CHAVE_GRUPOS)).toBe(true);
    expect(estaInvalidada(m.consultas, CHAVE_SESSAO)).toBe(true);
  });

  it('GEL-22: arquivar invalida a lista, o grupo e a sessão', async () => {
    const m = montarHook(() => useArquivarGrupo('g-quinta'), { 'POST /api/grupos/g-quinta/arquivar': () => json(200, {}) });
    semear(m.consultas);
    await act(async () => {
      await m.result.current.mutateAsync({ nomeConfirmacao: 'Pelada de Quinta' });
    });
    expect(m.chamadasA('POST', '/api/grupos/g-quinta/arquivar')[0]?.corpo).toEqual({ nomeConfirmacao: 'Pelada de Quinta' });
    expect(estaInvalidada(m.consultas, CHAVE_GRUPOS)).toBe(true);
    expect(estaInvalidada(m.consultas, chaveGrupo('g-quinta'))).toBe(true);
    expect(estaInvalidada(m.consultas, CHAVE_SESSAO)).toBe(true);
    expect(estaInvalidada(m.consultas, chaveGrupo('g-outro'))).toBe(false);
  });

  it('GEL-22: arquivar recusado não invalida nada', async () => {
    const m = montarHook(() => useArquivarGrupo('g-quinta'), {
      'POST /api/grupos/g-quinta/arquivar': () => json(403, { erro: 'Só quem criou.', codigo: 'so_quem_criou' }),
    });
    semear(m.consultas);
    await act(async () => {
      await m.result.current.mutateAsync({ nomeConfirmacao: 'Pelada de Quinta' }).catch(() => undefined);
    });
    expect(estaInvalidada(m.consultas, CHAVE_GRUPOS)).toBe(false);
    expect(estaInvalidada(m.consultas, CHAVE_SESSAO)).toBe(false);
  });

  it('GEL-28: reativar invalida a lista, o grupo e a sessão', async () => {
    const m = montarHook(() => useReativarGrupo('g-quinta'), { 'POST /api/grupos/g-quinta/reativar': () => json(200, {}) });
    semear(m.consultas);
    await act(async () => {
      await m.result.current.mutateAsync();
    });
    expect(estaInvalidada(m.consultas, CHAVE_GRUPOS)).toBe(true);
    expect(estaInvalidada(m.consultas, chaveGrupo('g-quinta'))).toBe(true);
    expect(estaInvalidada(m.consultas, CHAVE_SESSAO)).toBe(true);
  });
});
