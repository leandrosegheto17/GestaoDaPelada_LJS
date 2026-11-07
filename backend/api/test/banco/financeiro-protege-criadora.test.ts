import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  abrirCenarioGrupos,
  comoConta,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * A criadora do grupo não perde o acesso ao financeiro por ação de outro admin (validação do financeiro, S-1; FIN-35,
 * FIN-41) e o `pelada_app` só altera a coluna `acessa_financeiro` de `vinculos_admin` (S-5). Atores: C = criadora de G
 * (com acesso), O = admin de G sem acesso, B = conta só do grupo H. Cada teste roda numa transação desfeita ao fim;
 * `trocarPara` muda a conta do contexto no meio dela (o `SET LOCAL ROLE` continua `pelada_app`).
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

const trocarPara = (d: pg.Client, conta: string) =>
  d.query(`SELECT set_config('app.conta_id', $1, true)`, [conta]);

const alterar = (d: pg.Client, alvo: string, valor: boolean) =>
  d.query(
    'UPDATE vinculos_admin SET acessa_financeiro = $3 WHERE conta_id = $1 AND grupo_id = $2',
    [alvo, aberto.cenario.grupoG, valor],
  );

const acessoDe = async (d: pg.Client, conta: string): Promise<boolean | undefined> => {
  const r = await d.query<{ acessa_financeiro: boolean }>(
    'SELECT acessa_financeiro FROM vinculos_admin WHERE conta_id = $1 AND grupo_id = $2',
    [conta, aberto.cenario.grupoG],
  );
  return r.rows[0]?.acessa_financeiro;
};

describe('proteção do acesso da criadora (FIN-35, FIN-41)', () => {
  it('FIN-41: outro admin com acesso não retira o acesso da criadora: o banco recusa', async () => {
    const { db, cenario } = aberto;
    await comoConta(db, cenario.contaC, async (d) => {
      expect((await alterar(d, cenario.contaO, true)).rowCount).toBe(1);
      await d.query('SAVEPOINT antes');
      await trocarPara(d, cenario.contaO);
      await expect(alterar(d, cenario.contaC, false)).rejects.toMatchObject({ code: '42501' });
      await d.query('ROLLBACK TO SAVEPOINT antes');
      expect(await acessoDe(d, cenario.contaC)).toBe(true);
    });
  });

  it('FIN-41: outro admin com acesso ainda concede e retira o acesso de um terceiro admin', async () => {
    const { db, cenario } = aberto;
    await comoConta(db, cenario.contaC, async (d) => {
      await d.query(
        `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
         VALUES ($1, $2, false, $3, now())`,
        [cenario.contaB, cenario.grupoG, cenario.contaC],
      );
      expect((await alterar(d, cenario.contaO, true)).rowCount).toBe(1);
      await trocarPara(d, cenario.contaO);
      expect((await alterar(d, cenario.contaB, true)).rowCount).toBe(1);
      expect(await acessoDe(d, cenario.contaB)).toBe(true);
      expect((await alterar(d, cenario.contaB, false)).rowCount).toBe(1);
      expect(await acessoDe(d, cenario.contaB)).toBe(false);
    });
  });

  it('FIN-41: a criadora mantém o acesso ao conceder e retirar o de outro admin', async () => {
    const { db, cenario } = aberto;
    await comoConta(db, cenario.contaC, async (d) => {
      expect((await alterar(d, cenario.contaO, true)).rowCount).toBe(1);
      expect((await alterar(d, cenario.contaO, false)).rowCount).toBe(1);
      expect(await acessoDe(d, cenario.contaC)).toBe(true);
    });
  });
});

describe('UPDATE de vinculos_admin só na coluna acessa_financeiro (S-5)', () => {
  it('FIN-41: quem tem acesso não troca conta_id, grupo_id nem criado_por de outro vínculo', async () => {
    const { db, cenario } = aberto;
    for (const coluna of ['conta_id', 'grupo_id', 'criado_por']) {
      const valor = coluna === 'grupo_id' ? cenario.grupoH : cenario.contaB;
      await expect(
        comoConta(db, cenario.contaC, (d) =>
          d.query(
            `UPDATE vinculos_admin SET ${coluna} = $3 WHERE conta_id = $1 AND grupo_id = $2`,
            [cenario.contaO, cenario.grupoG, valor],
          ),
        ),
        coluna,
      ).rejects.toMatchObject({
        code: '42501',
        message: expect.stringContaining('só acessa_financeiro'),
      });
    }
  });
});
