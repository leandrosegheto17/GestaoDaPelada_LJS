import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, type CenarioAberto } from './apoio.ts';

/**
 * Meta-teste das funções de grupo (T6; GEL-112). Estende o meta-teste da CA (`meta-conta.test.ts`) às funções desta
 * feature: `grupo_criar` (`1792844340000_grupo-criar.sql:74-75`) e `grupos_visiveis`
 * (`1792844280000_grupos-visiveis-arquivado.sql:21-22`) são `SECURITY DEFINER`, com `search_path = public, pg_temp`,
 * sem `EXECUTE` para `PUBLIC` e com `EXECUTE` só para `pelada_app` (além do owner); a função da trigger
 * `grupos_arquivado_so_criadora` (`1792844520000_grupos-arquivar-so-criadora.sql:19`) não é executável por `PUBLIC`.
 * As variantes que devem reprovar rodam numa transação desfeita ao fim.
 *
 * Evidência da rede (registrar na T6): `GRANT EXECUTE ON FUNCTION grupo_criar(...) TO PUBLIC` deixa vermelho.
 */

const SEARCH_PATH = 'search_path=public, pg_temp';

interface Regra {
  assinatura: string;
  /** Exige `SECURITY DEFINER` e `EXECUTE` só para `pelada_app`. */
  definer: boolean;
}

const FUNCOES: readonly Regra[] = [
  // A de 6 parâmetros saiu na T25 do simulador (AD-037); a regra vale para a de 7.
  { assinatura: 'grupo_criar(text, text, text, time, text, text[], date)', definer: true },
  { assinatura: 'grupos_visiveis()', definer: true },
  { assinatura: 'grupos_arquivado_so_criadora()', definer: false },
];

let aberto: CenarioAberto;

beforeAll(async () => {
  aberto = await abrirCenario();
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Problemas de uma função pelo catálogo. Lista vazia = conforme a regra. */
async function problemasDa(db: pg.Client, regra: Regra): Promise<string[]> {
  const r = await db.query<{
    definer: boolean;
    config: string[] | null;
    publico: boolean;
    executores: string[];
  }>(
    `SELECT p.prosecdef AS definer, p.proconfig AS config,
            EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS publico,
            coalesce(array(SELECT r.rolname::text FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                             JOIN pg_roles r ON r.oid = a.grantee
                            WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
                            ORDER BY r.rolname), '{}') AS executores
       FROM pg_proc p WHERE p.oid = $1::regprocedure`,
    [regra.assinatura],
  );
  const f = r.rows[0];
  if (!f) return [`${regra.assinatura}: não existe`];
  const problemas: string[] = [];
  if (!(f.config ?? []).includes(SEARCH_PATH))
    problemas.push(`${regra.assinatura}: sem search_path fixo`);
  if (f.publico) problemas.push(`${regra.assinatura}: EXECUTE para PUBLIC`);
  if (regra.definer) {
    if (!f.definer) problemas.push(`${regra.assinatura}: sem SECURITY DEFINER`);
    if (f.executores.join(',') !== 'pelada_app') {
      problemas.push(
        `${regra.assinatura}: EXECUTE para ${f.executores.join(',') || 'ninguém'}, esperado só pelada_app`,
      );
    }
  }
  return problemas;
}

async function com<T>(ddl: string, fn: () => Promise<T>): Promise<T> {
  const { db } = aberto;
  await db.query('BEGIN');
  try {
    await db.query(ddl);
    return await fn();
  } finally {
    await db.query('ROLLBACK');
  }
}

describe('GEL-112: meta-teste das funções de grupo', () => {
  it.each(FUNCOES)('GEL-112: $assinatura conferida pelo catálogo', async (regra) => {
    expect(await problemasDa(aberto.db, regra)).toEqual([]);
  });

  it('GEL-112: uma função SECURITY DEFINER de teste sem search_path e sem REVOKE reprova', async () => {
    const regra: Regra = { assinatura: 'exemplo_grupo_sem_path()', definer: true };
    const p = await com(
      `CREATE FUNCTION exemplo_grupo_sem_path() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'`,
      () => problemasDa(aberto.db, regra),
    );
    expect(p).toEqual([
      'exemplo_grupo_sem_path(): sem search_path fixo',
      'exemplo_grupo_sem_path(): EXECUTE para PUBLIC',
      'exemplo_grupo_sem_path(): EXECUTE para ninguém, esperado só pelada_app',
    ]);
  });

  it('GEL-112: dar EXECUTE a PUBLIC na grupo_criar reprova', async () => {
    const regra = FUNCOES[0] as Regra;
    const p = await com(`GRANT EXECUTE ON FUNCTION ${regra.assinatura} TO PUBLIC`, () =>
      problemasDa(aberto.db, regra),
    );
    expect(p).toEqual([`${regra.assinatura}: EXECUTE para PUBLIC`]);
  });

  it('GEL-112: dar EXECUTE a pelada_backup_ro na grupos_visiveis reprova', async () => {
    const regra = FUNCOES[1] as Regra;
    const p = await com(`GRANT EXECUTE ON FUNCTION ${regra.assinatura} TO pelada_backup_ro`, () =>
      problemasDa(aberto.db, regra),
    );
    expect(p).toEqual([
      `${regra.assinatura}: EXECUTE para pelada_app,pelada_backup_ro, esperado só pelada_app`,
    ]);
  });

  it('GEL-112: PUBLIC executando a função da trigger reprova', async () => {
    const regra = FUNCOES[2] as Regra;
    const p = await com(`GRANT EXECUTE ON FUNCTION ${regra.assinatura} TO PUBLIC`, () =>
      problemasDa(aberto.db, regra),
    );
    expect(p).toEqual([`${regra.assinatura}: EXECUTE para PUBLIC`]);
  });
});
