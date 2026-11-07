import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { acessoFinanceiro } from '../../src/infraestrutura/db/repositorios/financeiro/acesso.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Conceder e retirar o acesso ao financeiro (T22; FIN-35, FIN-36, FIN-41), contra o cenário de grupos: C (criadora, com
 * acesso) altera O (admin sem acesso). O `afterEach` devolve O a `acessa_financeiro = false` e apaga a auditoria.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(
    `UPDATE vinculos_admin SET acessa_financeiro = (conta_id = $2) WHERE grupo_id = $1`,
    [cenario.grupoG, cenario.contaC],
  );
  await db.query(
    `DELETE FROM auditoria WHERE acao IN ('financeiro_concedido', 'financeiro_retirado')`,
  );
});

function alterar(
  alvo: string,
  valor: boolean,
  conta = aberto.cenario.contaC,
  opcoes = {},
  grupo = aberto.cenario.grupoG,
) {
  return comDb(
    aberto.url,
    conta,
    (db) => acessoFinanceiro.alterarFinanceiro(db, grupo, alvo, valor, opcoes),
    { confirmar: true },
  );
}

async function acessaDe(conta: string): Promise<boolean | undefined> {
  const r = await aberto.db.query<{ a: boolean }>(
    'SELECT acessa_financeiro AS a FROM vinculos_admin WHERE conta_id = $1 AND grupo_id = $2',
    [conta, aberto.cenario.grupoG],
  );
  return r.rows[0]?.a;
}

async function auditorias() {
  const r = await aberto.db.query(
    `SELECT acao, autor_conta_id, entidade_id FROM auditoria WHERE acao IN ('financeiro_concedido', 'financeiro_retirado') ORDER BY momento, id`,
  );
  return r.rows;
}

describe('acessoFinanceiro.alterarFinanceiro', () => {
  it('FIN-35: conceder grava, audita financeiro_concedido e devolve a lista com o acesso novo', async () => {
    const { cenario } = aberto;
    const r = await alterar(cenario.contaO, true);
    expect(r).toMatchObject({ resultado: 'ok', mudou: true });
    if (r.resultado !== 'ok') return;
    expect(r.lista.admins.find((a) => a.id === cenario.contaO)?.acessa_financeiro).toBe(true);
    expect(await acessaDe(cenario.contaO)).toBe(true);
    expect(await auditorias()).toEqual([
      { acao: 'financeiro_concedido', autor_conta_id: cenario.contaC, entidade_id: cenario.contaO },
    ]);
  });

  it('FIN-35: retirar grava e audita financeiro_retirado', async () => {
    const { cenario } = aberto;
    await alterar(cenario.contaO, true);
    const r = await alterar(cenario.contaO, false);
    expect(r).toMatchObject({ resultado: 'ok', mudou: true });
    expect(await acessaDe(cenario.contaO)).toBe(false);
    expect((await auditorias()).map((a) => a.acao)).toEqual([
      'financeiro_concedido',
      'financeiro_retirado',
    ]);
  });

  it('FIN-35: valor igual ao atual não grava nem audita, e devolve a lista', async () => {
    const { cenario } = aberto;
    const r = await alterar(cenario.contaO, false);
    expect(r).toMatchObject({ resultado: 'ok', mudou: false });
    if (r.resultado === 'ok') expect(r.lista.admins).toHaveLength(2);
    expect(await auditorias()).toEqual([]);
  });

  it('FIN-36: a própria conta é recusada sem gravar nem auditar', async () => {
    const { cenario } = aberto;
    expect(await alterar(cenario.contaC, false)).toEqual({ resultado: 'propria_conta' });
    expect(await acessaDe(cenario.contaC)).toBe(true);
    expect(await auditorias()).toEqual([]);
  });

  it('FIN-36: alvo que não é admin, de outro grupo ou inexistente: não encontrado', async () => {
    const { cenario } = aberto;
    expect(await alterar(cenario.contaB, true)).toEqual({ resultado: 'nao_encontrado' });
    expect(await alterar('00000000-0000-4000-8000-000000000000', true)).toEqual({
      resultado: 'nao_encontrado',
    });
    expect(await alterar(cenario.contaO, true, cenario.contaC, {}, cenario.grupoH)).toEqual({
      resultado: 'nao_encontrado',
    });
    expect(await auditorias()).toEqual([]);
  });

  it('FIN-41: com a checagem da própria conta pulada, o banco ainda recusa (zero linhas, sem auditoria)', async () => {
    const { cenario } = aberto;
    const r = await alterar(cenario.contaC, false, cenario.contaC, {
      pularChecagemDaPropriaConta: true,
    });
    expect(r).toEqual({ resultado: 'sem_permissao' });
    expect(await acessaDe(cenario.contaC)).toBe(true);
    expect(await auditorias()).toEqual([]);
  });

  it('FIN-41: a conta sem acesso tentando conceder a outro: o banco recusa (sem_permissao), nada muda', async () => {
    const { db, cenario } = aberto;
    // Terceira admin de G, sem acesso, como alvo de O (que também não tem acesso).
    const t = await db.query<{ id: string }>(
      `INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ('t22@exemplo.test', 'Terceira', 'x', now()) RETURNING id`,
    );
    const terceira = t.rows[0]!.id;
    await db.query(
      `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em) VALUES ($1, $2, false, $3, now())`,
      [terceira, cenario.grupoG, cenario.contaC],
    );
    try {
      expect(await alterar(terceira, true, cenario.contaO)).toEqual({ resultado: 'sem_permissao' });
      expect(await acessaDe(terceira)).toBe(false);
    } finally {
      await db.query('DELETE FROM vinculos_admin WHERE conta_id = $1', [terceira]);
      await db.query('DELETE FROM contas WHERE id = $1', [terceira]);
    }
  });
});

describe('acessoFinanceiro.alterarFinanceiro: acesso da criadora (S-1)', () => {
  it('FIN-35: retirar o acesso da criadora por outra admin com acesso devolve criadora, sem gravar nem auditar', async () => {
    const { cenario } = aberto;
    await alterar(cenario.contaO, true);
    const r = await alterar(cenario.contaC, false, cenario.contaO);
    expect(r).toEqual({ resultado: 'criadora' });
    expect(await acessaDe(cenario.contaC)).toBe(true);
    expect(await auditorias()).toHaveLength(1);
  });

  it('FIN-41: sem a checagem do repositório, o banco ainda recusa a retirada (42501)', async () => {
    const { cenario } = aberto;
    await alterar(cenario.contaO, true);
    await expect(
      alterar(cenario.contaC, false, cenario.contaO, { pularChecagemDaCriadora: true }),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await acessaDe(cenario.contaC)).toBe(true);
  });
});
