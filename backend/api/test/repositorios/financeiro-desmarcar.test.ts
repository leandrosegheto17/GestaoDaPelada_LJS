import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { financeiroPagamentos } from '../../src/infraestrutura/db/repositorios/financeiro/pagamentos.ts';
import { financeiroPagamentosDesmarcar } from '../../src/infraestrutura/db/repositorios/financeiro/pagamentos-desmarcar.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Desmarcar o pagamento (T19; FIN-22, FIN-23), contra o cenário de grupos. Cada caso marca fevereiro de 2026 para
 * Toninho pela própria `marcar` (T18), com "hoje" 2026-03-02, e desmarca. O `afterEach` apaga o que sobrou de
 * fevereiro e a auditoria dos casos. A desmarcação de janeiro do Bira (pagamento do cenário) é só leitura aqui.
 */

const HOJE = '2026-03-02';
const MES = '2026-02';

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db } = aberto;
  await db.query(`DELETE FROM pagamentos_mes WHERE mes = $1`, [MES]);
  await db.query(`DELETE FROM lancamentos WHERE descricao LIKE 'Mensalidade % 02/2026'`);
  await db.query(`DELETE FROM auditoria WHERE acao IN ('pagamento_marcado', 'pagamento_desmarcado')`);
});

function marcar(jogadorId: string) {
  const { url, cenario } = aberto;
  return comDb(url, cenario.contaC, (db) => financeiroPagamentos.marcar(db, cenario.grupoG, jogadorId, MES, HOJE), { confirmar: true });
}

function desmarcar(jogadorId: string, mes = MES, conta = aberto.cenario.contaC, grupo = aberto.cenario.grupoG) {
  return comDb(aberto.url, conta, (db) => financeiroPagamentosDesmarcar.desmarcar(db, grupo, jogadorId, mes), { confirmar: true });
}

async function contar(sql: string, valores: unknown[] = []): Promise<number> {
  const r = await aberto.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, valores);
  return r.rows[0]?.n ?? -1;
}

const pagamentosDeFevereiro = () => contar(`SELECT 1 FROM pagamentos_mes WHERE mes = '${MES}'`);
const lancamentosDeFevereiro = () => contar(`SELECT 1 FROM lancamentos WHERE descricao LIKE 'Mensalidade % 02/2026'`);

describe('financeiroPagamentosDesmarcar.desmarcar', () => {
  it('FIN-22: apaga o pagamento e a entrada vinculada e audita pagamento_desmarcado', async () => {
    const { db, cenario } = aberto;
    await marcar(cenario.idsG.jogadorAtivo);
    expect(await desmarcar(cenario.idsG.jogadorAtivo)).toEqual({ resultado: 'ok', valorCentavos: 5000 });
    expect(await pagamentosDeFevereiro()).toBe(0);
    expect(await lancamentosDeFevereiro()).toBe(0);
    const a = await db.query(`SELECT autor_conta_id, entidade_id, resumo FROM auditoria WHERE acao = 'pagamento_desmarcado'`);
    expect(a.rows).toEqual([
      { autor_conta_id: cenario.contaC, entidade_id: cenario.idsG.jogadorAtivo, resumo: { mes: MES, valorCentavos: 5000 } },
    ]);
  });

  it('FIN-22: apaga também quando o lançamento foi editado para outro valor, e a auditoria traz o valor editado', async () => {
    const { db, cenario } = aberto;
    await marcar(cenario.idsG.jogadorAtivo);
    await db.query(`UPDATE lancamentos SET valor_centavos = 7300, descricao = 'Mensalidade Toninho 02/2026 (editada)' WHERE descricao = 'Mensalidade Toninho 02/2026'`);
    expect(await desmarcar(cenario.idsG.jogadorAtivo)).toEqual({ resultado: 'ok', valorCentavos: 7300 });
    expect(await pagamentosDeFevereiro()).toBe(0);
    expect(await contar(`SELECT 1 FROM lancamentos WHERE descricao LIKE 'Mensalidade Toninho 02/2026%'`)).toBe(0);
    const a = await db.query(`SELECT resumo FROM auditoria WHERE acao = 'pagamento_desmarcado'`);
    expect(a.rows[0]?.resumo).toEqual({ mes: MES, valorCentavos: 7300 });
  });

  it('FIN-22: pagamento marcado sem mensalidade apaga só o pagamento, com valor nulo na auditoria', async () => {
    const { db, cenario } = aberto;
    await db.query('UPDATE config_financeira SET mensalidade_centavos = NULL WHERE grupo_id = $1', [cenario.grupoG]);
    try {
      await marcar(cenario.idsG.jogadorAtivo);
      expect(await desmarcar(cenario.idsG.jogadorAtivo)).toEqual({ resultado: 'ok', valorCentavos: null });
      expect(await pagamentosDeFevereiro()).toBe(0);
    } finally {
      await db.query('UPDATE config_financeira SET mensalidade_centavos = 5000 WHERE grupo_id = $1', [cenario.grupoG]);
    }
  });

  it('FIN-22: jogador inativado depois de pagar continua desmarcável', async () => {
    const { db, cenario } = aberto;
    await marcar(cenario.idsG.jogadorAtivo);
    await db.query(`UPDATE periodos_ativos SET fim = '2026-02-10' WHERE jogador_id = $1`, [cenario.idsG.jogadorAtivo]);
    try {
      expect((await desmarcar(cenario.idsG.jogadorAtivo)).resultado).toBe('ok');
      expect(await pagamentosDeFevereiro()).toBe(0);
    } finally {
      await db.query(`UPDATE periodos_ativos SET fim = NULL WHERE jogador_id = $1`, [cenario.idsG.jogadorAtivo]);
    }
  });

  it('FIN-23: sem pagamento no mês, não encontrado e nada é auditado', async () => {
    const { cenario } = aberto;
    expect(await desmarcar(cenario.idsG.jogadorAtivo)).toEqual({ resultado: 'nao_encontrado' });
    expect(await contar(`SELECT 1 FROM auditoria WHERE acao = 'pagamento_desmarcado'`)).toBe(0);
  });

  it('FIN-23: jogador de outro grupo e id inexistente dão o mesmo não encontrado, sem apagar o pagamento de G', async () => {
    const { cenario } = aberto;
    await marcar(cenario.idsG.jogadorAtivo);
    expect(await desmarcar(cenario.idsG.jogadorAtivo, MES, cenario.contaC, cenario.grupoH)).toEqual({ resultado: 'nao_encontrado' });
    expect(await desmarcar('00000000-0000-4000-8000-000000000000')).toEqual({ resultado: 'nao_encontrado' });
    expect(await pagamentosDeFevereiro()).toBe(1);
  });

  it('FIN-23: duas conexões desmarcando: uma remove, a outra recebe não encontrado, sem erro', async () => {
    const { cenario } = aberto;
    await marcar(cenario.idsG.jogadorAtivo);
    const resultados = await Promise.all([desmarcar(cenario.idsG.jogadorAtivo), desmarcar(cenario.idsG.jogadorAtivo)]);
    expect(resultados.map((r) => r.resultado).sort()).toEqual(['nao_encontrado', 'ok']);
    expect(await pagamentosDeFevereiro()).toBe(0);
    expect(await lancamentosDeFevereiro()).toBe(0);
    expect(await contar(`SELECT 1 FROM auditoria WHERE acao = 'pagamento_desmarcado'`)).toBe(1);
  });

  it('FIN-21: falha forçada na auditoria desfaz a desmarcação (pagamento e lançamento voltam)', async () => {
    const { db, cenario } = aberto;
    await marcar(cenario.idsG.jogadorAtivo);
    await db.query(
      `CREATE FUNCTION falha_forcada_desmarcar() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN RAISE EXCEPTION 'falha forçada na auditoria'; END $$`,
    );
    await db.query(
      `CREATE TRIGGER falha_forcada_desmarcar BEFORE INSERT ON auditoria
         FOR EACH ROW WHEN (NEW.acao = 'pagamento_desmarcado') EXECUTE FUNCTION falha_forcada_desmarcar()`,
    );
    try {
      await expect(desmarcar(cenario.idsG.jogadorAtivo)).rejects.toThrow(/falha forçada na auditoria/);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS falha_forcada_desmarcar ON auditoria');
      await db.query('DROP FUNCTION IF EXISTS falha_forcada_desmarcar()');
    }
    expect(await pagamentosDeFevereiro()).toBe(1);
    expect(await lancamentosDeFevereiro()).toBe(1);
  });

  it('FIN-39: admin sem acesso ao financeiro não desmarca (a RLS esconde o pagamento) e nada é apagado', async () => {
    const { cenario } = aberto;
    await marcar(cenario.idsG.jogadorAtivo);
    expect(await desmarcar(cenario.idsG.jogadorAtivo, MES, cenario.contaO)).toEqual({ resultado: 'nao_encontrado' });
    expect(await pagamentosDeFevereiro()).toBe(1);
    expect(await lancamentosDeFevereiro()).toBe(1);
  });
});
