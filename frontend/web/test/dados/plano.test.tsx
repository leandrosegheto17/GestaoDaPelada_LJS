import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { chaveGrupo, useEditarGrupo } from '../../src/dados/grupos.ts';
import {
  chavePlano,
  erroDePlano,
  useAssinar,
  useCancelar,
  usePlano,
} from '../../src/dados/plano.ts';
import { estaInvalidada, montarHook } from '../apoio/dados.tsx';
import { json } from '../apoio/tela.tsx';

/** Dados do plano no front (planos-e-cobranca T41; PLA-21, PLA-54). */

const PLANO = {
  plano: 'trial',
  situacao: 'trial',
  trialFimEm: '2026-11-15',
  pagoAte: null,
  jogadoresAtivos: 12,
  limiteJogadores: null,
  somenteLeitura: null,
  recursos: ['partidas', 'ranking', 'simulador', 'financeiro', 'pdf', 'push'],
  podeAssinar: true,
  assinatura: null,
};
const DADOS_GRUPO = {
  nome: 'Pelada de Quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
} as const;

describe('usePlano', () => {
  it('PLA-54: lê GET /api/grupos/:grupoId/plano conferido pelo contrato', async () => {
    const { result } = montarHook(() => usePlano('g1'), {
      'GET /api/grupos/g1/plano': () => json(200, PLANO),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.plano).toBe('trial');
  });

  it('PLA-54: resposta fora do contrato é erro, não dado', async () => {
    const { result } = montarHook(() => usePlano('g1'), {
      'GET /api/grupos/g1/plano': () => json(200, { ...PLANO, plano: 'premium' }),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('PLA-54: montar de novo relê o plano (não fica no cache da visita anterior)', async () => {
    const primeiro = montarHook(() => usePlano('g1'), {
      'GET /api/grupos/g1/plano': () => json(200, PLANO),
    });
    await waitFor(() => expect(primeiro.result.current.isSuccess).toBe(true));
    primeiro.unmount();
    const segundo = montarHook(() => usePlano('g1'), {
      'GET /api/grupos/g1/plano': () => json(200, PLANO),
    });
    await waitFor(() => expect(segundo.result.current.isSuccess).toBe(true));
    expect(segundo.chamadasA('GET', '/api/grupos/g1/plano')).toHaveLength(1);
  });
});

describe('invalidação pelo 403 de plano', () => {
  it.each([
    ['somente_leitura', { erro: 'somente_leitura', motivo: 'limite_jogadores' }],
    ['plano_pro', { erro: 'plano_pro', recurso: 'simulador' }],
  ])('PLA-21: 403 %s em qualquer escrita invalida o plano do grupo', async (_codigo, corpo) => {
    const { result, consultas } = montarHook(() => useEditarGrupo('g1'), {
      'PATCH /api/grupos/g1': () => json(403, corpo),
    });
    consultas.setQueryData(chavePlano('g1'), PLANO);
    consultas.setQueryData(chavePlano('g2'), PLANO);
    await act(async () => {
      await result.current.mutateAsync(DADOS_GRUPO).catch(() => undefined);
    });
    expect(estaInvalidada(consultas, chavePlano('g1'))).toBe(true);
    expect(estaInvalidada(consultas, chavePlano('g2'))).toBe(true);
  });

  it('PLA-21: outro 403 (so_quem_criou) não invalida o plano', async () => {
    const { result, consultas } = montarHook(() => useEditarGrupo('g1'), {
      'PATCH /api/grupos/g1': () =>
        json(403, { erro: 'Só quem criou o grupo pode fazer isso.', codigo: 'so_quem_criou' }),
    });
    consultas.setQueryData(chavePlano('g1'), PLANO);
    consultas.setQueryData(chaveGrupo('g1'), { id: 'g1' });
    await act(async () => {
      await result.current.mutateAsync(DADOS_GRUPO).catch(() => undefined);
    });
    expect(estaInvalidada(consultas, chavePlano('g1'))).toBe(false);
  });
});

describe('useAssinar e useCancelar', () => {
  it('PLA-54: assinar envia nome e CPF, devolve a fatura e relê o plano', async () => {
    const { result, consultas, chamadasA } = montarHook(() => useAssinar('g1'), {
      'POST /api/grupos/g1/assinatura': () =>
        json(201, { faturaUrl: 'https://sandbox.asaas.com/i/1' }),
    });
    consultas.setQueryData(chavePlano('g1'), PLANO);
    let resposta: unknown;
    await act(async () => {
      resposta = await result.current.mutateAsync({ nome: 'Maria Silva', cpf: '52998224725' });
    });
    expect(resposta).toEqual({ faturaUrl: 'https://sandbox.asaas.com/i/1' });
    expect(chamadasA('POST', '/api/grupos/g1/assinatura')[0]?.corpo).toEqual({
      nome: 'Maria Silva',
      cpf: '52998224725',
    });
    expect(estaInvalidada(consultas, chavePlano('g1'))).toBe(true);
  });

  it('PLA-54: 409 assinatura_pendente traz a fatura em aberto e relê o plano', async () => {
    const { result, consultas } = montarHook(() => useAssinar('g1'), {
      'POST /api/grupos/g1/assinatura': () =>
        json(409, { erro: 'assinatura_pendente', faturaUrl: 'https://sandbox.asaas.com/i/9' }),
    });
    consultas.setQueryData(chavePlano('g1'), PLANO);
    let erro: unknown;
    await act(async () => {
      await result.current
        .mutateAsync({ nome: 'Maria Silva', cpf: '52998224725' })
        .catch((e: unknown) => {
          erro = e;
        });
    });
    expect(erroDePlano(erro)).toEqual({
      tipo: 'assinatura_pendente',
      faturaUrl: 'https://sandbox.asaas.com/i/9',
    });
    expect(estaInvalidada(consultas, chavePlano('g1'))).toBe(true);
  });

  it('cancelar chama DELETE …/assinatura com X-Pelada e relê o plano, também no 502', async () => {
    const { result, consultas, chamadasA } = montarHook(() => useCancelar('g1'), {
      'DELETE /api/grupos/g1/assinatura': () =>
        json(502, {
          erro: 'pagamento_indisponivel',
          mensagem:
            'Não foi possível falar com o sistema de pagamento. Tente de novo em instantes.',
        }),
    });
    consultas.setQueryData(chavePlano('g1'), PLANO);
    let erro: unknown;
    await act(async () => {
      await result.current.mutateAsync().catch((e: unknown) => {
        erro = e;
      });
    });
    expect(chamadasA('DELETE', '/api/grupos/g1/assinatura')[0]?.cabecalhos['X-Pelada']).toBe('1');
    expect(erroDePlano(erro)?.tipo).toBe('pagamento_indisponivel');
    expect(estaInvalidada(consultas, chavePlano('g1'))).toBe(true);
  });
});
