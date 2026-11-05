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
 * Evento público e grants de `eventos_uso` (T23; PAR-127, PAR-129, PAR-130, PAR-131; AD-034), como `pelada_app`.
 * Contextos: conta C (admin de G), conta B (só de H), slug de G e slug de H. Cada célula da matriz da tabela e da função
 * morre com a policy aberta, sem a exigência de conta ou com grant a mais.
 */

const DISPOSITIVO = '6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
const MOMENTO = '2026-10-15T22:00:00Z';

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

async function contar(d: pg.Client, sql: string, valores: unknown[] = []): Promise<number> {
  const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, valores);
  return r.rows[0]?.n ?? -1;
}

async function privilegios(tabela: string): Promise<string[]> {
  const r = await aberto.db.query<{ privilege_type: string }>(
    `SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'pelada_app' AND table_schema = 'public' AND table_name = $1
      ORDER BY privilege_type`,
    [tabela],
  );
  return r.rows.map((l) => l.privilege_type);
}

const registrar = (d: pg.Client, slug: string, tipo: string, dispositivo: string | null, mes: string | null) =>
  d.query<{ ok: boolean }>('SELECT evento_publico_registrar($1, $2, $3::uuid, $4, $5::timestamptz) AS ok', [
    slug,
    tipo,
    dispositivo,
    mes,
    MOMENTO,
  ]);

const inserirDireto = (d: pg.Client, grupo: string) =>
  d.query(`INSERT INTO eventos_uso (grupo_id, tipo, momento, dispositivo_id) VALUES ($1, 'ranking_aberto', now(), $2)`, [
    grupo,
    DISPOSITIVO,
  ]);

describe('grants de eventos_uso', () => {
  it('PAR-130: pelada_app tem só SELECT e INSERT em eventos_uso', async () => {
    expect(await privilegios('eventos_uso')).toEqual(['INSERT', 'SELECT']);
  });

  it('PAR-130: UPDATE, DELETE e TRUNCATE recusados, mesmo com conta do grupo', async () => {
    const { db, cenario } = aberto;
    for (const comando of [
      'UPDATE eventos_uso SET momento = now()',
      'DELETE FROM eventos_uso',
      'TRUNCATE eventos_uso',
    ]) {
      await expect(comoConta(db, cenario.contaC, (d) => d.query(comando)), comando).rejects.toMatchObject({
        code: '42501',
      });
    }
  });
});

describe('policies de eventos_uso', () => {
  it('PAR-129: com conta, C lê os eventos de G; B não lê os de G', async () => {
    const { db, cenario } = aberto;
    const deG = (conta: string) =>
      comoConta(db, conta, (d) => contar(d, 'SELECT 1 FROM eventos_uso WHERE grupo_id = $1', [cenario.grupoG]));
    expect(await deG(cenario.contaC)).toBeGreaterThan(0);
    expect(await deG(cenario.contaB)).toBe(0);
  });

  it('PAR-129: o contexto do slug de G não lê eventos_uso', async () => {
    const { db, cenario } = aberto;
    expect(await comoApp(db, { slug: cenario.slugG }, (d) => contar(d, 'SELECT 1 FROM eventos_uso'))).toBe(0);
  });

  it('PAR-131: com conta, C insere evento em G; em H é recusado', async () => {
    const { db, cenario } = aberto;
    const r = await comoConta(db, cenario.contaC, (d) => inserirDireto(d, cenario.grupoG));
    expect(r.rowCount).toBe(1);
    await expect(comoConta(db, cenario.contaC, (d) => inserirDireto(d, cenario.grupoH))).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('PAR-131: no contexto do slug, INSERT direto em eventos_uso ou em outra tabela é recusado', async () => {
    const { db, cenario } = aberto;
    await expect(comoApp(db, { slug: cenario.slugG }, (d) => inserirDireto(d, cenario.grupoG))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      comoApp(db, { slug: cenario.slugG }, (d) =>
        d.query(
          `INSERT INTO partidas (grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
           VALUES ($1, '2026-10-22', $2, now(), $2, now())`,
          [cenario.grupoG, cenario.contaC],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('evento_publico_registrar', () => {
  it('PAR-131: no contexto do slug, grava ranking_aberto e pdf_exportado e devolve true', async () => {
    const { db, cenario } = aberto;
    await comoApp(db, { slug: cenario.slugG }, async (d) => {
      expect((await registrar(d, cenario.slugG, 'ranking_aberto', DISPOSITIVO, null)).rows[0]?.ok).toBe(true);
      expect((await registrar(d, cenario.slugG, 'pdf_exportado', null, '2026-10')).rows[0]?.ok).toBe(true);
      await d.query('RESET ROLE');
      expect(
        await contar(d, `SELECT 1 FROM eventos_uso WHERE grupo_id = $1 AND momento = $2::timestamptz`, [
          cenario.grupoG,
          MOMENTO,
        ]),
      ).toBe(2);
    });
  });

  it('PAR-129: a linha gravada só tem grupo, tipo, momento e o dispositivo ou o mês', async () => {
    const { db, cenario } = aberto;
    await comoApp(db, { slug: cenario.slugG }, async (d) => {
      await registrar(d, cenario.slugG, 'ranking_aberto', DISPOSITIVO, null);
      await registrar(d, cenario.slugG, 'pdf_exportado', null, '2026-09');
      await d.query('RESET ROLE');
      const r = await d.query(
        `SELECT grupo_id, tipo, momento::text AS momento, dispositivo_id, mes_exportado, data_partida
           FROM eventos_uso WHERE momento = $1::timestamptz ORDER BY tipo DESC`,
        [MOMENTO],
      );
      expect(r.rows).toEqual([
        {
          grupo_id: cenario.grupoG,
          tipo: 'ranking_aberto',
          momento: expect.any(String),
          dispositivo_id: DISPOSITIVO,
          mes_exportado: null,
          data_partida: null,
        },
        {
          grupo_id: cenario.grupoG,
          tipo: 'pdf_exportado',
          momento: expect.any(String),
          dispositivo_id: null,
          mes_exportado: '2026-09',
          data_partida: null,
        },
      ]);
    });
  });

  it('PAR-127: slug de outro grupo que não o do contexto devolve false sem gravar', async () => {
    const { db, cenario } = aberto;
    const slugH = await db.query<{ slug: string }>('SELECT slug FROM grupos WHERE id = $1', [cenario.grupoH]);
    await comoApp(db, { slug: cenario.slugG }, async (d) => {
      const r = await registrar(d, slugH.rows[0]?.slug ?? '', 'ranking_aberto', DISPOSITIVO, null);
      expect(r.rows[0]?.ok).toBe(false);
      await d.query('RESET ROLE');
      expect(await contar(d, 'SELECT 1 FROM eventos_uso WHERE momento = $1::timestamptz', [MOMENTO])).toBe(0);
    });
  });

  it('PAR-127: slug de grupo arquivado devolve false sem gravar', async () => {
    const { db, cenario } = aberto;
    await arquivar(db, cenario.grupoG);
    try {
      await comoApp(db, { slug: cenario.slugG }, async (d) => {
        const r = await registrar(d, cenario.slugG, 'ranking_aberto', DISPOSITIVO, null);
        expect(r.rows[0]?.ok).toBe(false);
        await d.query('RESET ROLE');
        expect(await contar(d, 'SELECT 1 FROM eventos_uso WHERE momento = $1::timestamptz', [MOMENTO])).toBe(0);
      });
    } finally {
      await reativar(db, cenario.grupoG);
    }
  });

  it('PAR-127: slug inexistente (igual ao do contexto) devolve false', async () => {
    const { db } = aberto;
    const r = await comoApp(db, { slug: 'nao-existe' }, (d) =>
      registrar(d, 'nao-existe', 'ranking_aberto', DISPOSITIVO, null),
    );
    expect(r.rows[0]?.ok).toBe(false);
  });

  it('PAR-127: com conta na sessão, a função recusa', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaC, slug: cenario.slugG }, (d) =>
        registrar(d, cenario.slugG, 'ranking_aberto', DISPOSITIVO, null),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('PAR-131: tipos com conta (partida_lancada, escalacao_confirmada) e combinações inválidas são recusados', async () => {
    const { db, cenario } = aberto;
    const casos: Array<[string, string | null, string | null]> = [
      ['partida_lancada', null, null],
      ['escalacao_confirmada', null, null],
      ['ranking_aberto', null, null],
      ['ranking_aberto', DISPOSITIVO, '2026-10'],
      ['pdf_exportado', null, null],
      ['pdf_exportado', DISPOSITIVO, '2026-10'],
    ];
    for (const [tipo, dispositivo, mes] of casos) {
      await expect(
        comoApp(db, { slug: cenario.slugG }, (d) => registrar(d, cenario.slugG, tipo, dispositivo, mes)),
        `${tipo} ${dispositivo ?? '-'} ${mes ?? '-'}`,
      ).rejects.toMatchObject({ code: '22023' });
    }
  });

  it('PAR-131: SECURITY DEFINER, search_path fixo e EXECUTE só para pelada_app', async () => {
    const r = await aberto.db.query<{ definer: boolean; config: string[] | null; executores: string[] }>(
      `SELECT p.prosecdef AS definer, p.proconfig AS config,
              coalesce(array(SELECT coalesce(r.rolname::text, 'PUBLIC')
                               FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                               LEFT JOIN pg_roles r ON r.oid = a.grantee
                              WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
                              ORDER BY 1), '{}') AS executores
         FROM pg_proc p WHERE p.oid = 'evento_publico_registrar(text,text,uuid,text,timestamptz)'::regprocedure`,
    );
    expect(r.rows[0]).toEqual({ definer: true, config: ['search_path=public, pg_temp'], executores: ['pelada_app'] });
  });
});
