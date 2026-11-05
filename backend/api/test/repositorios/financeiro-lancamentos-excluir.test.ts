import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { lancamentosExcluir } from '../../src/infraestrutura/db/repositorios/financeiro/lancamentos-excluir.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Excluir lançamento (T21; FIN-29, FIN-30, FIN-31), contra o cenário de grupos. O lançamento do cenário é a entrada
 * vinculada ao pagamento de janeiro do Bira; os avulsos de cada caso levam "T21" na descrição e saem no `afterEach`,
 * com a auditoria dos casos.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db } = aberto;
  await db.query(`DELETE FROM lancamentos WHERE descricao LIKE 'T21%'`);
  await db.query(`DELETE FROM auditoria WHERE acao = 'lancamento_excluido'`);
});

async function avulso(grupo = aberto.cenario.grupoG, conta = aberto.cenario.contaC): Promise<string> {
  const r = await aberto.db.query<{ id: string }>(
    `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'saida', '2026-02-14', 'T21 Coletes', 4321, $2, now(), $2, now()) RETURNING id`,
    [grupo, conta],
  );
  return r.rows[0]!.id;
}

function excluir(id: string, opcoes = {}, conta = aberto.cenario.contaC) {
  const { url, cenario } = aberto;
  return comDb(url, conta, (db) => lancamentosExcluir.excluir(db, cenario.grupoG, id, opcoes), { confirmar: true });
}

async function existe(id: string): Promise<boolean> {
  return ((await aberto.db.query('SELECT 1 FROM lancamentos WHERE id = $1', [id])).rowCount ?? 0) > 0;
}

describe('lancamentosExcluir.excluir', () => {
  it('FIN-29: apaga o avulso e audita lancamento_excluido com tipo, data e valor, sem a descrição', async () => {
    const { db, cenario } = aberto;
    const id = await avulso();
    expect(await excluir(id)).toEqual({ resultado: 'ok' });
    expect(await existe(id)).toBe(false);
    const a = await db.query(`SELECT autor_conta_id, entidade_id, resumo FROM auditoria WHERE acao = 'lancamento_excluido'`);
    expect(a.rows).toEqual([
      { autor_conta_id: cenario.contaC, entidade_id: id, resumo: { tipo: 'saida', data: '2026-02-14', valorCentavos: 4321 } },
    ]);
    expect(JSON.stringify(a.rows[0]?.resumo)).not.toContain('Coletes');
  });

  it('FIN-30: a entrada vinculada é recusada com o apelido e o mês, e nada é apagado nem auditado', async () => {
    const { db, cenario } = aberto;
    expect(await excluir(cenario.idsG.lancamento)).toEqual({ resultado: 'vinculado', apelido: 'Bira', mes: '2026-01' });
    expect(await existe(cenario.idsG.lancamento)).toBe(true);
    const p = await db.query(`SELECT 1 FROM pagamentos_mes WHERE lancamento_id = $1`, [cenario.idsG.lancamento]);
    expect(p.rowCount).toBe(1);
    expect((await db.query(`SELECT 1 FROM auditoria WHERE acao = 'lancamento_excluido'`)).rowCount).toBe(0);
  });

  it('FIN-30: com a checagem pulada (simulação da corrida), o 23503 da FK vira o mesmo vinculado', async () => {
    const { cenario } = aberto;
    expect(await excluir(cenario.idsG.lancamento, { pularChecagemDoVinculo: true })).toEqual({
      resultado: 'vinculado',
      apelido: 'Bira',
      mes: '2026-01',
    });
    expect(await existe(cenario.idsG.lancamento)).toBe(true);
  });

  it('FIN-30: depois do 23503 a transação segue utilizável (o savepoint desfez só o DELETE)', async () => {
    const { url, cenario } = aberto;
    const depois = await comDb(url, cenario.contaC, async (db) => {
      await lancamentosExcluir.excluir(db, cenario.grupoG, cenario.idsG.lancamento, { pularChecagemDoVinculo: true });
      const r = await sql<{ n: number }>`SELECT count(*)::int AS n FROM lancamentos WHERE id = ${cenario.idsG.lancamento}`.execute(db);
      return r.rows[0]?.n;
    });
    expect(depois).toBe(1);
  });

  it('FIN-31: id de outro grupo e id inexistente dão o mesmo não encontrado, sem apagar', async () => {
    const { cenario } = aberto;
    const deH = await avulso(cenario.grupoH, cenario.contaB);
    expect(await excluir(deH)).toEqual({ resultado: 'nao_encontrado' });
    expect(await excluir('00000000-0000-4000-8000-000000000000')).toEqual({ resultado: 'nao_encontrado' });
    expect(await existe(deH)).toBe(true);
  });

  it('FIN-29: duas exclusões simultâneas do mesmo avulso: uma apaga, a outra recebe não encontrado', async () => {
    const id = await avulso();
    const r = await Promise.all([excluir(id), excluir(id)]);
    expect(r.map((x) => x.resultado).sort()).toEqual(['nao_encontrado', 'ok']);
    expect((await aberto.db.query(`SELECT 1 FROM auditoria WHERE acao = 'lancamento_excluido'`)).rowCount).toBe(1);
  });

  it('FIN-39: admin sem acesso ao financeiro não vê o lançamento (não encontrado) e nada é apagado', async () => {
    const { cenario } = aberto;
    const id = await avulso();
    expect(await excluir(id, {}, cenario.contaO)).toEqual({ resultado: 'nao_encontrado' });
    expect(await existe(id)).toBe(true);
  });
});
