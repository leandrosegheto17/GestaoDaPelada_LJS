import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErroApi } from '../../src/dados/cliente.ts';
import {
  caminhoMes,
  chaveLancamento,
  chaveMesFinanceiro,
  erroDoFinanceiro,
  useAlterarAcessoFinanceiro,
  useCriarLancamento,
  useDesmarcarPagamento,
  useEditarLancamento,
  useExcluirLancamento,
  useLancamento,
  useMarcarPagamento,
  useMesFinanceiro,
  useSalvarConfig,
} from '../../src/dados/financeiro.ts';
import { chaveGrupo } from '../../src/dados/grupos.ts';
import { estaInvalidada, montarHook } from '../apoio/dados.tsx';
import { json } from '../apoio/tela.tsx';

/** Dados do financeiro no front (financeiro T36; FIN-07). Ids em uuid: o contrato do financeiro os exige. */

const G = 'b6f1d6a2-3c1e-4a8e-9f00-000000000001';
const J = 'b6f1d6a2-3c1e-4a8e-9f00-0000000000a1';
const L = 'b6f1d6a2-3c1e-4a8e-9f00-0000000000c1';
const O = 'b6f1d6a2-3c1e-4a8e-9f00-0000000000e1';
const BASE = `/api/grupos/${G}/financeiro`;

const MES = {
  mes: '2026-10',
  hoje: '2026-10-22',
  navegacao: { mesAnterior: '2026-09', mesSeguinte: null },
  config: { mensalidadeCentavos: 7500, saldoInicialCentavos: 35000, dataSaldoInicial: '2026-02-05' },
  saldoAtualCentavos: 124550,
  resumoMes: { entradasCentavos: 120000, saidasCentavos: 90000, resultadoCentavos: 30000, naoPagaram: 1 },
  pagamentos: [{ jogadorId: J, apelido: 'Toninho', pagou: false }],
  lancamentos: [{ id: L, tipo: 'saida', data: '2026-10-05', descricao: 'Aluguel da quadra outubro', valorCentavos: 80000, mensalidade: false }],
};

const LANCAMENTO = {
  id: L,
  tipo: 'saida',
  data: '2026-10-05',
  descricao: 'Aluguel da quadra outubro',
  valorCentavos: 80000,
  mensalidade: false,
  alteradoPor: 'Leandro',
  alteradoEm: '2026-10-15T23:41:00.000Z',
};

const CORPO_LANCAMENTO = { tipo: 'saida', data: '2026-10-05', descricao: 'Aluguel da quadra outubro', valorCentavos: 80000 } as const;

describe('useMesFinanceiro', () => {
  it('FIN-07: lê o mês pelo contrato', async () => {
    const { result } = montarHook(() => useMesFinanceiro(G), { [`GET ${BASE}/mes`]: () => json(200, MES) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.saldoAtualCentavos).toBe(124550);
  });

  it('FIN-07: resposta fora do contrato (decimal) é erro, não dado', async () => {
    const { result } = montarHook(() => useMesFinanceiro(G), {
      [`GET ${BASE}/mes`]: () => json(200, { ...MES, saldoAtualCentavos: 1245.5 }),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('FIN-07: o mês escolhido vai em ?mes= e o mês padrão sem parâmetro', () => {
    expect(caminhoMes(G)).toBe(`${BASE}/mes`);
    expect(caminhoMes(G, '2026-07')).toBe(`${BASE}/mes?mes=2026-07`);
  });

  it('FIN-33: 403 sem_permissao_financeiro chega traduzido', async () => {
    const { result } = montarHook(() => useMesFinanceiro(G), {
      [`GET ${BASE}/mes`]: () => json(403, { erro: 'Você não tem acesso ao financeiro deste grupo.', codigo: 'sem_permissao_financeiro' }),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(erroDoFinanceiro(result.current.error)).toMatchObject({
      codigo: 'sem_permissao_financeiro',
      mensagem: 'Você não tem acesso ao financeiro deste grupo.',
      status: 403,
    });
  });
});

describe('escritas do caixa', () => {
  it('FIN-01: salvar a configuração faz PUT e invalida o mês e o grupo', async () => {
    const m = montarHook(() => useSalvarConfig(G), { [`PUT ${BASE}/config`]: (corpo) => json(200, corpo) });
    m.consultas.setQueryData(chaveMesFinanceiro(G, undefined), MES);
    m.consultas.setQueryData(chaveGrupo(G), { id: G });
    const dados = { mensalidadeCentavos: 7500, saldoInicialCentavos: 35000, dataSaldoInicial: '2026-02-05' };
    await act(async () => {
      await m.result.current.mutateAsync(dados);
    });
    expect(m.chamadasA('PUT', `${BASE}/config`)[0]?.corpo).toEqual(dados);
    expect(estaInvalidada(m.consultas, chaveMesFinanceiro(G, undefined))).toBe(true);
    expect(estaInvalidada(m.consultas, chaveGrupo(G))).toBe(true);
  });

  it('FIN-16: marcar faz POST com jogador e mês', async () => {
    const m = montarHook(() => useMarcarPagamento(G), { [`POST ${BASE}/pagamentos`]: () => json(204) });
    await act(async () => {
      await m.result.current.mutateAsync({ jogadorId: J, mes: '2026-10' });
    });
    expect(m.chamadasA('POST', `${BASE}/pagamentos`)[0]?.corpo).toEqual({ jogadorId: J, mes: '2026-10' });
  });

  it('FIN-20: 409 pagamento_ja_marcado chega traduzido', async () => {
    const m = montarHook(() => useMarcarPagamento(G), {
      [`POST ${BASE}/pagamentos`]: () => json(409, { erro: 'O pagamento deste mês já está marcado.', codigo: 'pagamento_ja_marcado' }),
    });
    let erro: unknown;
    await act(async () => {
      erro = await m.result.current.mutateAsync({ jogadorId: J, mes: '2026-10' }).catch((e: unknown) => e);
    });
    expect(erroDoFinanceiro(erro)).toMatchObject({ codigo: 'pagamento_ja_marcado', mensagem: 'O pagamento deste mês já está marcado.' });
  });

  it('FIN-22: desmarcar faz DELETE em pagamentos/:jogadorId/:mes', async () => {
    const m = montarHook(() => useDesmarcarPagamento(G), { [`DELETE ${BASE}/pagamentos/${J}/2026-10`]: () => json(204) });
    await act(async () => {
      await m.result.current.mutateAsync({ jogadorId: J, mes: '2026-10' });
    });
    expect(m.chamadasA('DELETE', `${BASE}/pagamentos/${J}/2026-10`)).toHaveLength(1);
  });
});

describe('lançamentos', () => {
  it('FIN-32: useLancamento lê pelo contrato', async () => {
    const { result } = montarHook(() => useLancamento(G, L), { [`GET ${BASE}/lancamentos/${L}`]: () => json(200, LANCAMENTO) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.alteradoPor).toBe('Leandro');
  });

  it('FIN-25: criar faz POST e guarda o lançamento', async () => {
    const m = montarHook(() => useCriarLancamento(G), { [`POST ${BASE}/lancamentos`]: () => json(201, LANCAMENTO) });
    await act(async () => {
      await m.result.current.mutateAsync(CORPO_LANCAMENTO);
    });
    expect(m.chamadasA('POST', `${BASE}/lancamentos`)[0]?.corpo).toEqual(CORPO_LANCAMENTO);
    expect(m.consultas.getQueryData(chaveLancamento(G, L))).toEqual(LANCAMENTO);
  });

  it('FIN-26: 422 traz a mensagem de cada campo', async () => {
    const m = montarHook(() => useCriarLancamento(G), {
      [`POST ${BASE}/lancamentos`]: () =>
        json(422, {
          erro: 'Corrija os campos indicados.',
          codigo: 'dados_invalidos',
          campos: ['descricao', 'valorCentavos'],
          mensagens: { descricao: 'A descrição precisa ter de 1 a 80 caracteres.' },
        }),
    });
    let erro: unknown;
    await act(async () => {
      erro = await m.result.current.mutateAsync(CORPO_LANCAMENTO).catch((e: unknown) => e);
    });
    expect(erroDoFinanceiro(erro)).toMatchObject({
      codigo: 'dados_invalidos',
      campos: { descricao: 'A descrição precisa ter de 1 a 80 caracteres.', valorCentavos: 'Confira este campo.' },
    });
  });

  it('FIN-27: editar faz PUT no id e guarda o editado', async () => {
    const editado = { ...LANCAMENTO, valorCentavos: 85000 };
    const m = montarHook(() => useEditarLancamento(G, L), { [`PUT ${BASE}/lancamentos/${L}`]: () => json(200, editado) });
    await act(async () => {
      await m.result.current.mutateAsync({ ...CORPO_LANCAMENTO, valorCentavos: 85000 });
    });
    expect(m.consultas.getQueryData(chaveLancamento(G, L))).toEqual(editado);
  });

  it('FIN-30: excluir a mensalidade: 409 lancamento_vinculado com a orientação', async () => {
    const orientacao = 'Esta entrada é a mensalidade de Toninho 10/2026. Desmarque o pagamento no mês para removê-la.';
    const m = montarHook(() => useExcluirLancamento(G, L), {
      [`DELETE ${BASE}/lancamentos/${L}`]: () => json(409, { erro: orientacao, codigo: 'lancamento_vinculado' }),
    });
    let erro: unknown;
    await act(async () => {
      erro = await m.result.current.mutateAsync().catch((e: unknown) => e);
    });
    expect(erroDoFinanceiro(erro)).toMatchObject({ codigo: 'lancamento_vinculado', mensagem: orientacao, status: 409 });
  });

  it('FIN-29: excluir faz DELETE e tira o lançamento do cache', async () => {
    const m = montarHook(() => useExcluirLancamento(G, L), { [`DELETE ${BASE}/lancamentos/${L}`]: () => json(204) });
    m.consultas.setQueryData(chaveLancamento(G, L), LANCAMENTO);
    await act(async () => {
      await m.result.current.mutateAsync();
    });
    expect(m.consultas.getQueryData(chaveLancamento(G, L))).toBeUndefined();
  });
});

describe('acesso ao financeiro', () => {
  it('FIN-35: PATCH grava a lista devolvida na consulta dos admins', async () => {
    const lista = { admins: [{ id: O, nome: 'Outra', email: 'o@exemplo.test', acessaFinanceiro: true }], convites: [] };
    const m = montarHook(() => useAlterarAcessoFinanceiro(G), {
      [`PATCH /api/grupos/${G}/admins/${O}/financeiro`]: () => json(200, lista),
    });
    await act(async () => {
      await m.result.current.mutateAsync({ contaId: O, acessaFinanceiro: true });
    });
    expect(m.chamadasA('PATCH', `/api/grupos/${G}/admins/${O}/financeiro`)[0]?.corpo).toEqual({ acessaFinanceiro: true });
    expect(m.consultas.getQueryData(['admins', G])).toEqual(lista);
  });

  it('FIN-36: 409 acao_na_propria_conta chega traduzido', async () => {
    const m = montarHook(() => useAlterarAcessoFinanceiro(G), {
      [`PATCH /api/grupos/${G}/admins/${O}/financeiro`]: () =>
        json(409, { erro: 'Você não pode alterar a sua própria permissão.', codigo: 'acao_na_propria_conta' }),
    });
    let erro: unknown;
    await act(async () => {
      erro = await m.result.current.mutateAsync({ contaId: O, acessaFinanceiro: false }).catch((e: unknown) => e);
    });
    expect(erroDoFinanceiro(erro)).toMatchObject({ codigo: 'acao_na_propria_conta' });
  });
});

describe('erroDoFinanceiro', () => {
  it('FIN-50: plano_pro na forma da AD-091 (sem codigo) vira o código e a mensagem', () => {
    const erro = new ErroApi(403, undefined, 'x', { erro: 'plano_pro', recurso: 'financeiro', mensagem: 'Este recurso é do plano Pro.' });
    expect(erroDoFinanceiro(erro)).toEqual({ codigo: 'plano_pro', mensagem: 'Este recurso é do plano Pro.', campos: {}, status: 403 });
  });

  it('grupo_arquivado e nao_encontrado são reconhecidos', () => {
    expect(erroDoFinanceiro(new ErroApi(409, undefined, 'x', { erro: 'Arquivado.', codigo: 'grupo_arquivado' })).codigo).toBe('grupo_arquivado');
    expect(erroDoFinanceiro(new ErroApi(404, undefined, 'x', { erro: 'Não.', codigo: 'nao_encontrado' })).codigo).toBe('nao_encontrado');
  });

  it('código desconhecido e erro de rede não têm código', () => {
    expect(erroDoFinanceiro(new ErroApi(500, undefined, 'Algo deu errado.', { erro: 'Erro interno.' }))).toMatchObject({
      codigo: null,
      mensagem: 'Erro interno.',
    });
    expect(erroDoFinanceiro(new ErroApi(0, undefined, 'Sem rede.'))).toMatchObject({ codigo: null, mensagem: 'Sem rede.', status: 0 });
  });
});
