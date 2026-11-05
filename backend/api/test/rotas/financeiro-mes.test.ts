import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mesFinanceiroResposta } from '@pelada/contrato';
import { abrirCenarioGrupos, arquivar, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { pedir, restaurarCaixa } from './apoio-financeiro.ts';

/**
 * `GET /api/grupos/:grupoId/financeiro/mes` (financeiro T26; FIN-07, FIN-08, FIN-09, FIN-14), com o app real como
 * `pelada_app` e o relógio fixo em 2026-10-15 (São Paulo). G: mensalidade 5000, saldo inicial 0 desde 2026-01-01; um
 * lançamento de entrada de 5000 em 2026-01-05, vinculado ao pagamento de Bira em 2026-01; Toninho e Bira ativos desde
 * 2026-01-01, Zé Inativo só em 2025. O `afterEach` restaura o caixa.
 *
 * Casos limite: sem `mes` (mês do relógio); primeiro mês do histórico (sem anterior); mês de hoje (sem seguinte); mês
 * antes da data inicial e mês futuro (422 fora do histórico); `2026-13` e `10-2026` (422 mês inválido); parâmetro extra
 * (422); sem configuração (200 com nulos); ordem dos lançamentos no mesmo dia; reflexo do PUT da config (FIN-01).
 */

let aberto: CenarioGruposAberto;

const lerMes = (consulta = '', conta = aberto.cenario.contaC) =>
  pedir(aberto, { metodo: 'GET', caminho: `/grupos/${aberto.cenario.grupoG}/financeiro/mes${consulta}`, conta });

async function lancar(tipo: 'entrada' | 'saida', data: string, descricao: string, valor: number): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, $3, $4, $5, $6, now(), $6, now()) RETURNING id`,
    [cenario.grupoG, tipo, data, descricao, valor, cenario.contaC],
  );
  return r.rows[0]!.id;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
  await restaurarCaixa(aberto);
});

describe('GET …/financeiro/mes', () => {
  it('FIN-07: sem mes, o mês do relógio com todos os campos da resposta', async () => {
    const { idsG } = aberto.cenario;
    const r = await lerMes();
    expect(r.status).toBe(200);
    const corpo = mesFinanceiroResposta.parse(await r.json());
    expect(corpo).toEqual({
      mes: '2026-10',
      hoje: '2026-10-15',
      navegacao: { mesAnterior: '2026-09', mesSeguinte: null },
      config: { mensalidadeCentavos: 5000, saldoInicialCentavos: 0, dataSaldoInicial: '2026-01-01' },
      saldoAtualCentavos: 5000,
      resumoMes: { entradasCentavos: 0, saidasCentavos: 0, resultadoCentavos: 0, naoPagaram: 2 },
      pagamentos: [
        { jogadorId: idsG.jogadorHistorico, apelido: 'Bira', pagou: false },
        { jogadorId: idsG.jogadorAtivo, apelido: 'Toninho', pagou: false },
      ],
      lancamentos: [],
    });
  });

  it('FIN-07, FIN-14: o primeiro mês traz o pagamento, o lançamento vinculado e a navegação sem anterior', async () => {
    const { idsG } = aberto.cenario;
    const r = await lerMes('?mes=2026-01');
    expect(r.status).toBe(200);
    const corpo = mesFinanceiroResposta.parse(await r.json());
    expect(corpo.navegacao).toEqual({ mesAnterior: null, mesSeguinte: '2026-02' });
    expect(corpo.resumoMes).toEqual({ entradasCentavos: 5000, saidasCentavos: 0, resultadoCentavos: 5000, naoPagaram: 1 });
    expect(corpo.pagamentos).toEqual([
      { jogadorId: idsG.jogadorHistorico, apelido: 'Bira', pagou: true },
      { jogadorId: idsG.jogadorAtivo, apelido: 'Toninho', pagou: false },
    ]);
    expect(corpo.lancamentos).toEqual([
      { id: idsG.lancamento, tipo: 'entrada', data: '2026-01-05', descricao: 'Mensalidade', valorCentavos: 5000, mensalidade: true },
    ]);
  });

  it('FIN-14: lançamentos do mês do mais recente ao mais antigo, mensalidade só no vinculado', async () => {
    const antigo = await lancar('saida', '2026-10-02', 'Bola nova', 12000);
    const recente = await lancar('entrada', '2026-10-14', 'Rifa', 3000);
    const mesmoDiaDepois = await lancar('entrada', '2026-10-14', 'Doação', 1000);
    const r = await lerMes('?mes=2026-10');
    expect(r.status).toBe(200);
    const corpo = mesFinanceiroResposta.parse(await r.json());
    expect(corpo.lancamentos.map((l) => l.id)).toEqual([mesmoDiaDepois, recente, antigo]);
    expect(corpo.lancamentos.every((l) => l.mensalidade === false)).toBe(true);
    expect(corpo.lancamentos.find((l) => l.id === antigo)).toMatchObject({ tipo: 'saida', valorCentavos: 12000 });
    expect(corpo.resumoMes).toEqual({ entradasCentavos: 4000, saidasCentavos: 12000, resultadoCentavos: -8000, naoPagaram: 2 });
    expect(corpo.saldoAtualCentavos).toBe(5000 + 4000 - 12000);
  });

  it('FIN-08: sem configuração, 200 com configuração, saldo e resumo nulos, listas vazias e navegação nula', async () => {
    await aberto.db.query('DELETE FROM config_financeira WHERE grupo_id = $1', [aberto.cenario.grupoG]);
    const r = await lerMes();
    expect(r.status).toBe(200);
    expect(mesFinanceiroResposta.parse(await r.json())).toEqual({
      mes: '2026-10',
      hoje: '2026-10-15',
      navegacao: { mesAnterior: null, mesSeguinte: null },
      config: null,
      saldoAtualCentavos: null,
      resumoMes: null,
      pagamentos: [],
      lancamentos: [],
    });
  });

  it.each(['2025-12', '2026-11'])('FIN-09: %s, fora do histórico, dá 422 com a mensagem no campo mes', async (mes) => {
    const r = await lerMes(`?mes=${mes}`);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      codigo: 'dados_invalidos',
      campos: ['mes'],
      mensagens: { mes: 'Mês fora do histórico do caixa.' },
    });
  });

  it.each(['2026-13', '10-2026', '2026-1', ''])('FIN-09: mes malformado (%j) dá 422 "Mês inválido." no campo', async (mes) => {
    const r = await lerMes(`?mes=${mes}`);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ campos: ['mes'], mensagens: { mes: 'Mês inválido.' } });
  });

  it('parâmetro extra na consulta dá 422', async () => {
    const r = await lerMes('?mes=2026-10&ano=2026');
    expect(r.status).toBe(422);
  });

  it('FIN-01: o PUT da configuração aparece no GET do mês', async () => {
    const put = await pedir(aberto, {
      metodo: 'PUT',
      caminho: `/grupos/${aberto.cenario.grupoG}/financeiro/config`,
      conta: aberto.cenario.contaC,
      corpo: { mensalidadeCentavos: 7000, saldoInicialCentavos: 20000, dataSaldoInicial: '2026-03-01' },
    });
    expect(put.status).toBe(200);
    const corpo = mesFinanceiroResposta.parse(await (await lerMes()).json());
    expect(corpo.config).toEqual({ mensalidadeCentavos: 7000, saldoInicialCentavos: 20000, dataSaldoInicial: '2026-03-01' });
    // O lançamento de janeiro fica antes da data inicial: não entra no saldo (FIN-10).
    expect(corpo.saldoAtualCentavos).toBe(20000);
    // Janeiro saiu do histórico.
    expect((await lerMes('?mes=2026-01')).status).toBe(422);
  });

  it('FIN-33: admin sem acesso recebe 403', async () => {
    const r = await lerMes('', aberto.cenario.contaO);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'sem_permissao_financeiro' });
  });

  it('conta de outro grupo recebe 404', async () => {
    expect((await lerMes('', aberto.cenario.contaB)).status).toBe(404);
  });

  it('FIN-37: a criadora lê o mês do grupo arquivado', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    expect((await lerMes()).status).toBe(200);
  });
});
