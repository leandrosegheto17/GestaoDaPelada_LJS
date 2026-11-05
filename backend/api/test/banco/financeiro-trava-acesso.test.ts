import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenarioGrupos, comoConta, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Trava de `vinculos_admin.acessa_financeiro` e nomes das autoras (T10; FIN-41, FIN-32, FIN-42), como `pelada_app`.
 * Atores: C = criadora de G (com acesso), O = admin de G sem acesso, B = conta só do grupo H (sem vínculo com G).
 * A matriz completa da coluna (4 células) é da T13; aqui ficam os ramos de cada policy e as funções que não podem quebrar.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

const alterar = (conta: string, alvo: string, valor: boolean) => {
  const { db, cenario } = aberto;
  return comoConta(db, conta, async (d) => {
    const r = await d.query(
      'UPDATE vinculos_admin SET acessa_financeiro = $3 WHERE conta_id = $1 AND grupo_id = $2',
      [alvo, cenario.grupoG, valor],
    );
    return r.rowCount;
  });
};

const inserirVinculo = (conta: string, novaConta: string, acessa: boolean) => {
  const { db, cenario } = aberto;
  return comoConta(db, conta, (d) =>
    d.query(
      `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
       VALUES ($1, $2, $3, $4, now())`,
      [novaConta, cenario.grupoG, acessa, conta],
    ),
  );
};

describe('UPDATE de acessa_financeiro', () => {
  it('FIN-41: a conta com acesso não muda a própria (zero linhas)', async () => {
    const { contaC } = aberto.cenario;
    expect(await alterar(contaC, contaC, false)).toBe(0);
  });

  it('FIN-41: a conta sem acesso não concede a si mesma (zero linhas)', async () => {
    const { contaO } = aberto.cenario;
    expect(await alterar(contaO, contaO, true)).toBe(0);
  });

  it('FIN-41: a conta sem acesso não muda a de outro admin (zero linhas)', async () => {
    const { contaO, contaC } = aberto.cenario;
    expect(await alterar(contaO, contaC, false)).toBe(0);
  });

  it('FIN-41: a conta com acesso concede e retira o de outro admin', async () => {
    const { contaC, contaO } = aberto.cenario;
    expect(await alterar(contaC, contaO, true)).toBe(1);
    expect(await alterar(contaC, contaO, false)).toBe(1);
  });

  it('FIN-41: UPDATE sem WHERE da conta sem acesso não afeta nenhum vínculo', async () => {
    const { db, cenario } = aberto;
    const afetadas = await comoConta(
      db,
      cenario.contaO,
      async (d) => (await d.query('UPDATE vinculos_admin SET acessa_financeiro = true')).rowCount,
    );
    expect(afetadas).toBe(0);
  });

  it('FIN-41: a conta com acesso não move o vínculo de outro admin para um grupo em que não tem acesso', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query('UPDATE vinculos_admin SET grupo_id = $3 WHERE conta_id = $1 AND grupo_id = $2', [
          cenario.contaO,
          cenario.grupoG,
          cenario.grupoH,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('INSERT direto de vínculo', () => {
  it('FIN-41: conta sem acesso insere vínculo com acessa_financeiro verdadeiro: recusado', async () => {
    const { contaO, contaB } = aberto.cenario;
    await expect(inserirVinculo(contaO, contaB, true)).rejects.toMatchObject({ code: '42501' });
  });

  it('FIN-41: conta sem acesso insere vínculo com acessa_financeiro falso: aceito', async () => {
    const { contaO, contaB } = aberto.cenario;
    expect((await inserirVinculo(contaO, contaB, false)).rowCount).toBe(1);
  });

  it('FIN-41: conta com acesso insere vínculo com acessa_financeiro verdadeiro: aceito', async () => {
    const { contaC, contaB } = aberto.cenario;
    expect((await inserirVinculo(contaC, contaB, true)).rowCount).toBe(1);
  });

  it('FIN-41: grupo_criar continua criando o vínculo da criadora com acesso (SECURITY DEFINER)', async () => {
    const { db, cenario } = aberto;
    const acessa = await comoConta(db, cenario.contaB, async (d) => {
      const g = await d.query<{ id: string }>(
        `SELECT id FROM grupo_criar('Pelada Nova', 'sexta', 'semanal', '21:00', 'pelada-nova', ARRAY['Passe']::text[],
           (now() AT TIME ZONE 'America/Sao_Paulo')::date)`,
      );
      const r = await d.query<{ acessa_financeiro: boolean }>(
        'SELECT acessa_financeiro FROM vinculos_admin WHERE conta_id = $1 AND grupo_id = $2',
        [cenario.contaB, g.rows[0]?.id],
      );
      return r.rows[0]?.acessa_financeiro;
    });
    expect(acessa).toBe(true);
  });
});

describe('contas_nomes_do_grupo com autoras de lançamentos', () => {
  async function nomesVistosPor(conta: string): Promise<string[]> {
    const { db, cenario } = aberto;
    return comoConta(db, conta, async (d) => {
      const r = await d.query<{ id: string }>('SELECT id FROM contas_nomes_do_grupo($1)', [cenario.grupoG]);
      return r.rows.map((l) => l.id);
    });
  }

  async function lancamentoDeO(): Promise<void> {
    const { db, cenario } = aberto;
    await db.query(
      `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'saida', '2026-01-12', 'Coletes', 2000, $2, now(), $2, now())`,
      [cenario.grupoG, cenario.contaO],
    );
  }

  it('FIN-32: a criadora, com acesso, recebe o nome da admin autora de um lançamento', async () => {
    const { contaC, contaO } = aberto.cenario;
    await lancamentoDeO();
    try {
      expect(await nomesVistosPor(contaC)).toContain(contaO);
    } finally {
      await aberto.db.query(`DELETE FROM lancamentos WHERE descricao = 'Coletes'`);
    }
  });

  it('FIN-32: a admin sem acesso não recebe o nome da autora de lançamento (ela mesma)', async () => {
    const { contaO } = aberto.cenario;
    await lancamentoDeO();
    try {
      expect(await nomesVistosPor(contaO)).not.toContain(contaO);
    } finally {
      await aberto.db.query(`DELETE FROM lancamentos WHERE descricao = 'Coletes'`);
    }
  });

  it('FIN-32: sem lançamento de O, a criadora não recebe O; com o id de outro grupo, zero linhas', async () => {
    const { db, cenario } = aberto;
    expect(await nomesVistosPor(cenario.contaC)).not.toContain(cenario.contaO);
    const deOutroGrupo = await comoConta(db, cenario.contaC, async (d) => {
      const r = await d.query('SELECT id FROM contas_nomes_do_grupo($1)', [cenario.grupoH]);
      return r.rowCount;
    });
    expect(deOutroGrupo).toBe(0);
  });
});
