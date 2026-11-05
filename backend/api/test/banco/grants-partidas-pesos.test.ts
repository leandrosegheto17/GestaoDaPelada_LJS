import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  abrirCenarioGrupos,
  comoConta,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * Grants por coluna em `partidas` e `config_pesos` (T25; PAR-09), como `pelada_app` com a conta C (admin de G).
 * Cada célula de UPDATE e DELETE da matriz: data e vigência recusadas, mover a linha para H recusado, sem `WHERE`
 * afeta só G, DELETE de pesos sem grant. Os UPDATE permitidos (chuva, pesos) continuam funcionando.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

async function colunasComUpdate(tabela: string): Promise<string[]> {
  const r = await aberto.db.query<{ coluna: string }>(
    `SELECT column_name AS coluna FROM information_schema.column_privileges
      WHERE grantee = 'pelada_app' AND table_schema = 'public' AND table_name = $1 AND privilege_type = 'UPDATE'
      ORDER BY column_name`,
    [tabela],
  );
  return r.rows.map((l) => l.coluna);
}

async function privilegiosDeTabela(tabela: string): Promise<string[]> {
  const r = await aberto.db.query<{ privilege_type: string }>(
    `SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'pelada_app' AND table_schema = 'public' AND table_name = $1
      ORDER BY privilege_type`,
    [tabela],
  );
  return r.rows.map((l) => l.privilege_type);
}

const recusa = { code: '42501' };

async function contar(d: pg.Client, sql: string, valores: unknown[] = []): Promise<number> {
  const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, valores);
  return r.rows[0]?.n ?? -1;
}

describe('grants de partidas e config_pesos', () => {
  it('PAR-09: UPDATE só em choveu, alterada_por e alterada_em de partidas', async () => {
    expect(await privilegiosDeTabela('partidas')).not.toContain('UPDATE');
    expect(await colunasComUpdate('partidas')).toEqual(['alterada_em', 'alterada_por', 'choveu']);
  });

  it('PAR-09: UPDATE só nos 6 pesos e na autoria do registro de config_pesos; DELETE sem grant', async () => {
    expect(await privilegiosDeTabela('config_pesos')).toEqual(['INSERT', 'SELECT']);
    expect(await colunasComUpdate('config_pesos')).toEqual([
      'expulso',
      'expulso_com_chuva',
      'lesionado_com_chuva',
      'lesionado_sem_chuva',
      'presenca_com_chuva',
      'presenca_sem_chuva',
      'registrado_em',
      'registrado_por',
    ]);
  });
});

describe('UPDATE e DELETE como pelada_app', () => {
  it('PAR-09: UPDATE de partidas.data recusado', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query(`UPDATE partidas SET data = '2026-01-09' WHERE id = $1`, [cenario.idsG.partida]),
      ),
    ).rejects.toMatchObject(recusa);
  });

  it('PAR-09: UPDATE de config_pesos.vigente_desde recusado', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query(`UPDATE config_pesos SET vigente_desde = '2026-01-02' WHERE grupo_id = $1`, [
          cenario.grupoG,
        ]),
      ),
    ).rejects.toMatchObject(recusa);
  });

  it('PAR-09: mover partida ou configuração de G para H recusado', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query('UPDATE partidas SET grupo_id = $2 WHERE id = $1', [
          cenario.idsG.partida,
          cenario.grupoH,
        ]),
      ),
    ).rejects.toMatchObject(recusa);
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query('UPDATE config_pesos SET grupo_id = $2 WHERE grupo_id = $1', [
          cenario.grupoG,
          cenario.grupoH,
        ]),
      ),
    ).rejects.toMatchObject(recusa);
  });

  it('PAR-09: UPDATE da autoria da criação da partida recusado', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query('UPDATE partidas SET criada_por = $2 WHERE id = $1', [
          cenario.idsG.partida,
          cenario.contaO,
        ]),
      ),
    ).rejects.toMatchObject(recusa);
  });

  it('PAR-09: DELETE em config_pesos recusado, sem grant', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query('DELETE FROM config_pesos WHERE grupo_id = $1', [cenario.grupoG]),
      ),
    ).rejects.toMatchObject(recusa);
  });

  it('PAR-09: UPDATE de choveu do grupo H, pela conta C, afeta 0 linhas', async () => {
    const { db, cenario } = aberto;
    const r = await comoConta(db, cenario.contaC, (d) =>
      d.query('UPDATE partidas SET choveu = NOT choveu WHERE grupo_id = $1', [cenario.grupoH]),
    );
    expect(r.rowCount).toBe(0);
  });

  it('PAR-09: UPDATE de choveu e dos pesos sem WHERE afeta só as linhas de G', async () => {
    const { db, cenario } = aberto;
    const [partidasDeG, pesosDeG] = [
      await contar(db, 'SELECT 1 FROM partidas WHERE grupo_id = $1', [cenario.grupoG]),
      await contar(db, 'SELECT 1 FROM config_pesos WHERE grupo_id = $1', [cenario.grupoG]),
    ];
    const totalPartidas = await contar(db, 'SELECT 1 FROM partidas');
    expect(totalPartidas, 'o cenário precisa de partidas fora de G').toBeGreaterThan(partidasDeG);
    const afetadas = await comoConta(db, cenario.contaC, async (d) => [
      (await d.query('UPDATE partidas SET choveu = NOT choveu')).rowCount,
      (await d.query('UPDATE config_pesos SET expulso = -2, expulso_com_chuva = -3')).rowCount,
    ]);
    expect(afetadas).toEqual([partidasDeG, pesosDeG]);
  });

  it('PAR-09: ON CONFLICT (grupo_id, vigente_desde) DO UPDATE dos pesos continua permitido', async () => {
    const { db, cenario } = aberto;
    const r = await comoConta(db, cenario.contaC, (d) =>
      d.query(
        `INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
           lesionado_com_chuva, expulso, expulso_com_chuva, registrado_por, registrado_em)
         VALUES ($1, '2026-01-01', 5, 5, 2, 2, -3, -3, $2, now())
         ON CONFLICT (grupo_id, vigente_desde) DO UPDATE
           SET presenca_sem_chuva = EXCLUDED.presenca_sem_chuva, presenca_com_chuva = EXCLUDED.presenca_com_chuva,
               lesionado_sem_chuva = EXCLUDED.lesionado_sem_chuva, lesionado_com_chuva = EXCLUDED.lesionado_com_chuva,
               expulso = EXCLUDED.expulso, expulso_com_chuva = EXCLUDED.expulso_com_chuva,
               registrado_por = EXCLUDED.registrado_por, registrado_em = EXCLUDED.registrado_em
         RETURNING presenca_sem_chuva`,
        [cenario.grupoG, cenario.contaC],
      ),
    );
    expect(r.rows).toEqual([{ presenca_sem_chuva: 5 }]);
  });
});
