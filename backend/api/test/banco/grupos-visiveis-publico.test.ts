import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from '../isolamento/apoio.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  gruposVistos,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * `grupos_visiveis()` com o ramo do slug só para grupo ativo (T26; PAR-91, PAR-92, PAR-93), como `pelada_app`.
 * Com G arquivado, o slug de G não lê nenhuma tabela; o slug de H (ativo) continua lendo H; reativado, o slug de G
 * volta a ler. O ramo com conta não muda (a rede da T0, item (a), fica verde).
 */

const TABELAS_DO_SLUG = [
  'grupos',
  'jogadores',
  'periodos_ativos',
  'partidas',
  'presencas',
  'config_pesos',
  'eventos_uso',
] as const;

let aberto: CenarioGruposAberto;
let slugH: string;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ slug: string }>('SELECT slug FROM grupos WHERE id = $1', [
    aberto.cenario.grupoH,
  ]);
  slugH = r.rows[0]?.slug ?? '';
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Linhas de cada tabela de `TABELAS_DO_SLUG`, vistas com só o slug. */
async function vistoPeloSlug(slug: string): Promise<Record<string, number>> {
  return comoApp(aberto.db, { slug }, async (d: pg.Client) => {
    const vistos: Record<string, number> = {};
    for (const tabela of TABELAS_DO_SLUG) {
      const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabela}`);
      vistos[tabela] = r.rows[0]?.n ?? -1;
    }
    return vistos;
  });
}

const zeros = Object.fromEntries(TABELAS_DO_SLUG.map((t) => [t, 0]));

describe('ramo do slug de grupos_visiveis()', () => {
  it('PAR-92: com G arquivado, o slug de G vê zero linhas nas 7 tabelas', async () => {
    const { db, cenario } = aberto;
    await arquivar(db, cenario.grupoG);
    try {
      expect(await vistoPeloSlug(cenario.slugG)).toEqual(zeros);
    } finally {
      await reativar(db, cenario.grupoG);
    }
  });

  it('PAR-92: com G arquivado, o slug de H (ativo) continua lendo H', async () => {
    const { db, cenario } = aberto;
    await arquivar(db, cenario.grupoG);
    try {
      const ids = await comoApp(db, { slug: slugH }, async (d) => {
        const r = await d.query<{ id: string }>('SELECT id FROM grupos');
        return r.rows.map((l) => l.id);
      });
      expect(ids).toEqual([cenario.grupoH]);
    } finally {
      await reativar(db, cenario.grupoG);
    }
  });

  it('PAR-93: reativado, o slug de G volta a ler o grupo, o elenco, as partidas e os pesos', async () => {
    const { db, cenario } = aberto;
    await arquivar(db, cenario.grupoG);
    await reativar(db, cenario.grupoG);
    const vistos = await vistoPeloSlug(cenario.slugG);
    expect(vistos.grupos).toBe(1);
    for (const tabela of [
      'jogadores',
      'periodos_ativos',
      'partidas',
      'presencas',
      'config_pesos',
    ] as const) {
      expect(vistos[tabela], tabela).toBeGreaterThan(0);
    }
    // eventos_uso só se lê com conta (T23), também com o grupo ativo.
    expect(vistos.eventos_uso).toBe(0);
  });

  it('PAR-91: o ramo com conta não muda: a criadora vê G arquivado, a outra admin não', async () => {
    const { db, cenario } = aberto;
    await arquivar(db, cenario.grupoG);
    try {
      expect(await gruposVistos(db, cenario.contaC)).toContain(cenario.grupoG);
      expect(await gruposVistos(db, cenario.contaO)).not.toContain(cenario.grupoG);
    } finally {
      await reativar(db, cenario.grupoG);
    }
  });

  it('PAR-91: SECURITY DEFINER, search_path fixo, STABLE e EXECUTE só para pelada_app', async () => {
    const r = await aberto.db.query<{
      definer: boolean;
      volatil: string;
      config: string[] | null;
      executores: string[];
    }>(
      `SELECT p.prosecdef AS definer, p.provolatile::text AS volatil, p.proconfig AS config,
              coalesce(array(SELECT coalesce(r.rolname::text, 'PUBLIC')
                               FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                               LEFT JOIN pg_roles r ON r.oid = a.grantee
                              WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
                              ORDER BY 1), '{}') AS executores
         FROM pg_proc p WHERE p.oid = 'grupos_visiveis()'::regprocedure`,
    );
    expect(r.rows[0]).toEqual({
      definer: true,
      volatil: 's',
      config: ['search_path=public, pg_temp'],
      executores: ['pelada_app'],
    });
  });
});
