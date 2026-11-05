import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from '../isolamento/apoio.ts';
import {
  abrirCenarioGrupos,
  comoConta,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * Migração das policies restritivas do financeiro (T9; FIN-38, FIN-39, FIN-42), no banco migrado, como `pelada_app`.
 * Atores do cenário de grupos: C = criadora de G (com `acessa_financeiro`), O = admin de G sem acesso, B = conta só do
 * grupo H. A matriz completa (3 tabelas × 4 comandos × 3 atores) é da T12 e da T13; aqui ficam a função, o caminho
 * principal de cada ator e a leitura do backup, que a restritiva não pode tirar.
 */

const TABELAS_FINANCEIRO = ['config_financeira', 'lancamentos', 'pagamentos_mes'] as const;

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

/** Linhas de G em cada tabela do financeiro, vistas pelo contexto dado. */
async function linhasDeG(contexto: { conta?: string; slug?: string }): Promise<number[]> {
  const { db, cenario } = aberto;
  return comoApp(db, contexto, async (d) => {
    const n: number[] = [];
    for (const tabela of TABELAS_FINANCEIRO) {
      n.push(await contar(d, `SELECT 1 FROM ${tabela} WHERE grupo_id = $1`, [cenario.grupoG]));
    }
    return n;
  });
}

const inserirLancamento = (d: pg.Client, grupo: string, conta: string | null) =>
  d.query(
    `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'saida', '2026-01-10', 'Bolas', 1000, $2, now(), $2, now()) RETURNING id`,
    [grupo, conta],
  );

/** Roda `fn` como `pelada_backup_ro`, numa transação desfeita ao fim. */
async function comoBackup<T>(db: pg.Client, fn: () => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE pelada_backup_ro');
    return await fn();
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
  }
}

describe('app_acessa_financeiro', () => {
  it('FIN-39: verdadeira só para a conta com vínculo e acessa_financeiro no grupo', async () => {
    const { db, cenario } = aberto;
    const pergunta = (contexto: { conta?: string; slug?: string }, grupo: string) =>
      comoApp(db, contexto, async (d) => {
        const r = await d.query<{ ok: boolean }>('SELECT app_acessa_financeiro($1) AS ok', [grupo]);
        return r.rows[0]?.ok;
      });
    expect(await pergunta({ conta: cenario.contaC }, cenario.grupoG)).toBe(true);
    expect(await pergunta({ conta: cenario.contaO }, cenario.grupoG)).toBe(false);
    expect(await pergunta({ conta: cenario.contaB }, cenario.grupoG)).toBe(false);
    expect(await pergunta({ conta: cenario.contaC }, cenario.grupoH)).toBe(false);
    expect(await pergunta({ slug: cenario.slugG }, cenario.grupoG)).toBe(false);
    expect(await pergunta({}, cenario.grupoG)).toBe(false);
  });

  it('FIN-42: SECURITY DEFINER, search_path fixo, sem EXECUTE para PUBLIC e EXECUTE só para pelada_app', async () => {
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
         FROM pg_proc p WHERE p.oid = 'app_acessa_financeiro(uuid)'::regprocedure`,
    );
    expect(r.rows[0]).toEqual({
      definer: true,
      config: ['search_path=public, pg_temp'],
      executores: ['pelada_app'],
    });
  });
});

describe('policies restritivas do financeiro', () => {
  it('FIN-38: com só o slug de G, zero linhas nas 3 tabelas', async () => {
    expect(await linhasDeG({ slug: aberto.cenario.slugG })).toEqual([0, 0, 0]);
  });

  it('FIN-38: com só o slug de G, INSERT de lançamento recusado', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { slug: cenario.slugG }, (d) => inserirLancamento(d, cenario.grupoG, null)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('FIN-39: O, admin de G sem acesso, vê zero linhas nas 3 tabelas', async () => {
    expect(await linhasDeG({ conta: aberto.cenario.contaO })).toEqual([0, 0, 0]);
  });

  it('FIN-39: a criadora C, com acesso, vê as linhas de G nas 3 tabelas', async () => {
    const linhas = await linhasDeG({ conta: aberto.cenario.contaC });
    expect(linhas).toHaveLength(3);
    expect(linhas.every((n) => n > 0)).toBe(true);
  });

  it('FIN-39: O não insere lançamento em G; C insere', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaO, (d) => inserirLancamento(d, cenario.grupoG, cenario.contaO)),
    ).rejects.toMatchObject({ code: '42501' });
    const r = await comoConta(db, cenario.contaC, (d) =>
      inserirLancamento(d, cenario.grupoG, cenario.contaC),
    );
    expect(r.rowCount).toBe(1);
  });

  it('FIN-39: UPDATE e DELETE sem WHERE de O afetam zero linhas de G', async () => {
    const { db, cenario } = aberto;
    const afetadas = await comoConta(db, cenario.contaO, async (d) => [
      (await d.query('UPDATE config_financeira SET saldo_inicial_centavos = 1')).rowCount,
      (await d.query('UPDATE lancamentos SET valor_centavos = 1')).rowCount,
      (await d.query('DELETE FROM pagamentos_mes')).rowCount,
    ]);
    expect(afetadas).toEqual([0, 0, 0]);
  });
});

describe('leitura do backup', () => {
  it('FIN-42: pelada_backup_ro continua lendo todas as linhas das 3 tabelas', async () => {
    const { db } = aberto;
    for (const tabela of TABELAS_FINANCEIRO) {
      const total = await contar(db, `SELECT 1 FROM ${tabela}`);
      expect(total, `${tabela}: o cenário precisa de linhas`).toBeGreaterThan(0);
      const visto = await comoBackup(db, () => contar(db, `SELECT 1 FROM ${tabela}`));
      expect(visto, `${tabela}: linhas vistas por pelada_backup_ro`).toBe(total);
    }
  });

  it('FIN-42: a restritiva vale só para pelada_app (nenhuma policy nova cita pelada_backup_ro)', async () => {
    const r = await aberto.db.query<{ tabela: string; roles: string[] }>(
      `SELECT c.relname::text AS tabela, array(SELECT r.rolname::text FROM pg_roles r WHERE r.oid = ANY (p.polroles)) AS roles
         FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE NOT p.polpermissive AND c.relname IN ('config_financeira', 'lancamentos', 'pagamentos_mes')
        ORDER BY 1`,
    );
    expect(r.rows).toEqual([
      { tabela: 'config_financeira', roles: ['pelada_app'] },
      { tabela: 'lancamentos', roles: ['pelada_app'] },
      { tabela: 'pagamentos_mes', roles: ['pelada_app'] },
    ]);
  });
});
