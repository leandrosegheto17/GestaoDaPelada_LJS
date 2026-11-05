import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from '../isolamento/apoio.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  comoConta,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * `contas_nomes_do_grupo` (T24; PAR-01, PAR-44, PAR-52; AD-036), como `pelada_app`. No cenário, C é a autora dos pesos
 * e da partida de G; O é admin de G sem autoria; B é só de H.
 *
 * Casos limite: autora por `config_pesos.registrado_por`, por `partidas.criada_por` e por `partidas.alterada_por`;
 * admin que não é autora; grupo de outra conta; sem conta; grupo arquivado para a admin que não o criou; nunca e-mail.
 */

let aberto: CenarioGruposAberto;
let nomeC: string;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ nome: string }>('SELECT nome FROM contas WHERE id = $1', [
    aberto.cenario.contaC,
  ]);
  nomeC = r.rows[0]?.nome ?? '';
});

afterAll(async () => {
  await aberto?.fechar();
});

interface Nome {
  id: string;
  nome: string;
}

async function nomes(d: pg.Client, grupo: string): Promise<Nome[]> {
  const r = await d.query<Nome>('SELECT * FROM contas_nomes_do_grupo($1)', [grupo]);
  return r.rows;
}

/** Roda `fn` como `pelada_app` com a conta, depois de `preparo` gravar como superusuário na mesma transação. */
async function comPreparo<T>(
  conta: string,
  preparo: (d: pg.Client) => Promise<unknown>,
  fn: (d: pg.Client) => Promise<T>,
): Promise<T> {
  const { db } = aberto;
  return comoConta(db, conta, async (d) => {
    await d.query('RESET ROLE');
    await preparo(d);
    await d.query('SET LOCAL ROLE pelada_app');
    return fn(d);
  });
}

describe('contas_nomes_do_grupo', () => {
  it('PAR-01: a admin O recebe o nome da autora C; não recebe a si mesma, que não é autora', async () => {
    const { db, cenario } = aberto;
    const r = await comoConta(db, cenario.contaO, (d) => nomes(d, cenario.grupoG));
    expect(r).toEqual([{ id: cenario.contaC, nome: nomeC }]);
  });

  it('PAR-01: a admin que registrou pesos passa a aparecer', async () => {
    const { cenario } = aberto;
    const r = await comPreparo(
      cenario.contaC,
      (d) =>
        d.query(
          `INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva,
             lesionado_sem_chuva, lesionado_com_chuva, expulso, registrado_por, registrado_em)
           VALUES ($1, '2026-02-01', 2, 2, 1, 1, -1, $2, now())`,
          [cenario.grupoG, cenario.contaO],
        ),
      (d) => nomes(d, cenario.grupoG),
    );
    expect(r.map((l) => l.id).sort()).toEqual([cenario.contaC, cenario.contaO].sort());
    expect(r.find((l) => l.id === cenario.contaO)?.nome).toBe('Outra Admin');
  });

  it('PAR-44: a admin que lançou uma partida passa a aparecer', async () => {
    const { cenario } = aberto;
    const r = await comPreparo(
      cenario.contaC,
      (d) =>
        d.query(
          `INSERT INTO partidas (grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
           VALUES ($1, '2026-02-05', $2, now(), $3, now())`,
          [cenario.grupoG, cenario.contaO, cenario.contaC],
        ),
      (d) => nomes(d, cenario.grupoG),
    );
    expect(r.map((l) => l.id)).toContain(cenario.contaO);
  });

  it('PAR-52: a admin que só alterou uma partida passa a aparecer', async () => {
    const { cenario } = aberto;
    const r = await comPreparo(
      cenario.contaC,
      (d) =>
        d.query(`UPDATE partidas SET alterada_por = $2 WHERE id = $1`, [
          cenario.idsG.partida,
          cenario.contaO,
        ]),
      (d) => nomes(d, cenario.grupoG),
    );
    expect(r.map((l) => l.id)).toContain(cenario.contaO);
  });

  it('PAR-01: com o id de H, C recebe zero linhas; B, com o id de G, também', async () => {
    const { db, cenario } = aberto;
    expect(await comoConta(db, cenario.contaC, (d) => nomes(d, cenario.grupoH))).toEqual([]);
    expect(await comoConta(db, cenario.contaB, (d) => nomes(d, cenario.grupoG))).toEqual([]);
  });

  it('PAR-01: sem conta (só o slug de G, ou sem contexto), zero linhas', async () => {
    const { db, cenario } = aberto;
    expect(await comoApp(db, { slug: cenario.slugG }, (d) => nomes(d, cenario.grupoG))).toEqual([]);
    expect(await comoApp(db, {}, (d) => nomes(d, cenario.grupoG))).toEqual([]);
  });

  it('PAR-01: grupo arquivado: O, que não o criou, recebe zero linhas; C ainda recebe', async () => {
    const { db, cenario } = aberto;
    await arquivar(db, cenario.grupoG);
    try {
      expect(await comoConta(db, cenario.contaO, (d) => nomes(d, cenario.grupoG))).toEqual([]);
      expect(await comoConta(db, cenario.contaC, (d) => nomes(d, cenario.grupoG))).toHaveLength(1);
    } finally {
      await reativar(db, cenario.grupoG);
    }
  });

  it('PAR-01: a função devolve só id e nome, nunca e-mail', async () => {
    const { db, cenario } = aberto;
    const campos = await comoConta(db, cenario.contaC, async (d) => {
      const r = await d.query('SELECT * FROM contas_nomes_do_grupo($1)', [cenario.grupoG]);
      return r.fields.map((f) => f.name);
    });
    expect(campos).toEqual(['id', 'nome']);
    const assinatura = await db.query<{ saida: string }>(
      `SELECT pg_get_function_result('contas_nomes_do_grupo(uuid)'::regprocedure) AS saida`,
    );
    expect(assinatura.rows[0]?.saida).not.toMatch(/email/i);
  });

  it('PAR-01: SECURITY DEFINER, search_path fixo e EXECUTE só para pelada_app', async () => {
    const r = await aberto.db.query<{
      definer: boolean;
      config: string[] | null;
      executores: string[];
    }>(
      `SELECT p.prosecdef AS definer, p.proconfig AS config,
              coalesce(array(SELECT coalesce(r.rolname::text, 'PUBLIC')
                               FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                               LEFT JOIN pg_roles r ON r.oid = a.grantee
                              WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
                              ORDER BY 1), '{}') AS executores
         FROM pg_proc p WHERE p.oid = 'contas_nomes_do_grupo(uuid)'::regprocedure`,
    );
    expect(r.rows[0]).toEqual({
      definer: true,
      config: ['search_path=public, pg_temp'],
      executores: ['pelada_app'],
    });
  });
});
