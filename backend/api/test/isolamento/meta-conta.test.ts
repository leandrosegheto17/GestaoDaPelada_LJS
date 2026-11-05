import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, type CenarioAberto } from './apoio.ts';

/**
 * Meta-teste das tabelas e funções de conta (T3; ACE-43, ACE-45). Estende o meta-teste da
 * fundação (`meta.test.ts`) às tabelas sem `grupo_id`: toda uma tem `ENABLE` e `FORCE ROW LEVEL
 * SECURITY`, policy de leitura para `pelada_backup_ro` e linha na matriz de conta. E toda função
 * `SECURITY DEFINER` do schema tem `search_path` fixo e não tem `EXECUTE` para `PUBLIC`
 * (fecha o risco do design da fundação, `FD:183`). As variantes que devem reprovar rodam numa
 * transação desfeita ao fim.
 */

/** Tabelas de conta (sem `grupo_id`) e o arquivo que traz os casos da matriz delas. */
const MATRIZ_CONTA: Readonly<Record<string, string>> = {
  contas: 'conta-sessao.test.ts',
  sessoes: 'conta-sessao.test.ts',
  tentativas_login: 'conta-apoio.test.ts',
  links_conta: 'conta-apoio.test.ts',
  envios_email: 'conta-apoio.test.ts',
  envios_email_dia: 'conta-apoio.test.ts',
  pedidos_email_origem: 'conta-apoio.test.ts',
  falhas_senha_atual: 'conta-apoio.test.ts',
  pedidos_reset: 'conta-apoio.test.ts',
};

/** Tabela de controle do node-pg-migrate: não é dado de conta nem de grupo. */
const FORA_DA_MATRIZ = new Set(['pgmigrations']);

/** O `search_path` que toda função `SECURITY DEFINER` fixa. */
const SEARCH_PATH = 'search_path=public, pg_temp';

/** Funções que só o owner executa: nem `PUBLIC` nem `pelada_app` (AD-008). */
const SO_OWNER = [
  'conta_definir_senha(text, text, boolean)',
  'email_cota_reservar_em(timestamptz, integer)',
  'email_origem_registrar_em(timestamptz, bytea, integer)',
];

let aberto: CenarioAberto;

beforeAll(async () => {
  aberto = await abrirCenario();
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Problemas das tabelas sem `grupo_id` (exceto `grupos`). Lista vazia = coberto. */
async function problemasDeTabelas(db: pg.Client, matriz: Readonly<Record<string, string>> = MATRIZ_CONTA): Promise<string[]> {
  const r = await db.query<{ tabela: string; habilitada: boolean; forcada: boolean; backup: boolean }>(
    `SELECT c.relname::text AS tabela, c.relrowsecurity AS habilitada, c.relforcerowsecurity AS forcada,
            EXISTS (SELECT 1 FROM pg_policy p JOIN pg_roles r ON r.oid = ANY (p.polroles)
                     WHERE p.polrelid = c.oid AND r.rolname = 'pelada_backup_ro'
                       AND p.polcmd IN ('r', '*')) AS backup
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'grupos'
        AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                         WHERE a.attrelid = c.oid AND a.attname = 'grupo_id' AND NOT a.attisdropped)
      ORDER BY c.relname`,
  );
  const problemas: string[] = [];
  const vistas = new Set<string>();
  for (const t of r.rows) {
    if (FORA_DA_MATRIZ.has(t.tabela)) continue;
    vistas.add(t.tabela);
    if (!t.habilitada) problemas.push(`${t.tabela}: sem ENABLE ROW LEVEL SECURITY`);
    if (!t.forcada) problemas.push(`${t.tabela}: sem FORCE ROW LEVEL SECURITY`);
    if (!t.backup) problemas.push(`${t.tabela}: sem policy de leitura para pelada_backup_ro`);
    if (!(t.tabela in matriz)) problemas.push(`${t.tabela}: sem linha na matriz de conta`);
  }
  for (const tabela of Object.keys(matriz).sort()) {
    if (!vistas.has(tabela)) problemas.push(`${tabela}: linha na matriz sem tabela no catálogo`);
  }
  return problemas;
}

/**
 * Problemas das funções `SECURITY DEFINER` do schema public (as das extensões ficam fora):
 * sem o `search_path` fixo, ou com `EXECUTE` para `PUBLIC` (ACL nula = padrão, que dá a PUBLIC).
 */
async function problemasDeFuncoes(db: pg.Client): Promise<string[]> {
  const r = await db.query<{ funcao: string; config: string[] | null; publico: boolean }>(
    `SELECT p.proname::text AS funcao, p.proconfig AS config,
            EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS publico
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND NOT EXISTS (SELECT 1 FROM pg_depend d
                         WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
      ORDER BY p.proname, p.oid`,
  );
  const problemas: string[] = [];
  for (const f of r.rows) {
    if (!(f.config ?? []).includes(SEARCH_PATH)) problemas.push(`${f.funcao}: SECURITY DEFINER sem search_path fixo`);
    if (f.publico) problemas.push(`${f.funcao}: EXECUTE para PUBLIC`);
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

describe('meta-teste das tabelas de conta', () => {
  it('ACE-45: no banco migrado, toda tabela de conta tem RLS forçada, leitura do backup e linha na matriz', async () => {
    expect(await problemasDeTabelas(aberto.db)).toEqual([]);
  });

  it('ACE-45: a matriz de conta cobre as 9 tabelas sem grupo_id', () => {
    expect(Object.keys(MATRIZ_CONTA)).toHaveLength(9);
  });

  it('ACE-45: tabela nova sem RLS, sem policy do backup e sem linha na matriz reprova', async () => {
    const p = await com('CREATE TABLE exemplo_conta (id int PRIMARY KEY)', () => problemasDeTabelas(aberto.db));
    expect(p).toEqual([
      'exemplo_conta: sem ENABLE ROW LEVEL SECURITY',
      'exemplo_conta: sem FORCE ROW LEVEL SECURITY',
      'exemplo_conta: sem policy de leitura para pelada_backup_ro',
      'exemplo_conta: sem linha na matriz de conta',
    ]);
  });

  it('ACE-45: tabela nova com RLS forçada e policy do backup, mas sem linha na matriz, reprova', async () => {
    const p = await com(
      `CREATE TABLE exemplo_conta (id int PRIMARY KEY);
       ALTER TABLE exemplo_conta ENABLE ROW LEVEL SECURITY;
       ALTER TABLE exemplo_conta FORCE ROW LEVEL SECURITY;
       CREATE POLICY exemplo_conta_backup ON exemplo_conta FOR SELECT TO pelada_backup_ro USING (true);`,
      () => problemasDeTabelas(aberto.db),
    );
    expect(p).toEqual(['exemplo_conta: sem linha na matriz de conta']);
  });

  it('ACE-45: tirar o FORCE de sessoes reprova', async () => {
    const p = await com('ALTER TABLE sessoes NO FORCE ROW LEVEL SECURITY', () => problemasDeTabelas(aberto.db));
    expect(p).toEqual(['sessoes: sem FORCE ROW LEVEL SECURITY']);
  });

  it('ACE-45: tirar a policy do backup de links_conta reprova', async () => {
    const p = await com('DROP POLICY links_conta_backup ON links_conta', () => problemasDeTabelas(aberto.db));
    expect(p).toEqual(['links_conta: sem policy de leitura para pelada_backup_ro']);
  });

  it('ACE-45: linha da matriz sem tabela no catálogo reprova', async () => {
    const p = await problemasDeTabelas(aberto.db, { ...MATRIZ_CONTA, tabela_que_nao_existe: 'nenhum' });
    expect(p).toEqual(['tabela_que_nao_existe: linha na matriz sem tabela no catálogo']);
  });
});

describe('meta-teste das funções SECURITY DEFINER', () => {
  it('ACE-43: no banco migrado, toda função SECURITY DEFINER tem search_path fixo e nenhuma dá EXECUTE a PUBLIC', async () => {
    expect(await problemasDeFuncoes(aberto.db)).toEqual([]);
  });

  it('ACE-43: as funções SECURITY DEFINER de conta estão no catálogo (ao menos as 20 desta feature)', async () => {
    const r = await aberto.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef`,
    );
    expect(r.rows[0]?.n).toBeGreaterThanOrEqual(20);
  });

  it('ACE-43: uma função SECURITY DEFINER criada sem search_path (e sem REVOKE) reprova', async () => {
    const p = await com(
      `CREATE FUNCTION exemplo_sem_path() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'`,
      () => problemasDeFuncoes(aberto.db),
    );
    expect(p).toEqual(['exemplo_sem_path: SECURITY DEFINER sem search_path fixo', 'exemplo_sem_path: EXECUTE para PUBLIC']);
  });

  it('ACE-43: dar EXECUTE a PUBLIC numa função de conta reprova', async () => {
    const p = await com('GRANT EXECUTE ON FUNCTION sessao_tocar(bytea) TO PUBLIC', () => problemasDeFuncoes(aberto.db));
    expect(p).toEqual(['sessao_tocar: EXECUTE para PUBLIC']);
  });

  it.each(SO_OWNER)('ACE-43: pelada_app não executa %s', async (assinatura) => {
    const r = await aberto.db.query<{ pode: boolean }>(`SELECT has_function_privilege('pelada_app', $1, 'EXECUTE') AS pode`, [
      assinatura,
    ]);
    expect(r.rows[0]?.pode).toBe(false);
  });

  it.each(SO_OWNER)('ACE-43: PUBLIC não executa %s', async (assinatura) => {
    const r = await aberto.db.query<{ publico: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       WHERE p.oid = $1::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS publico`,
      [assinatura],
    );
    expect(r.rows[0]?.publico).toBe(false);
  });

  it('ACE-43: pelada_app chamando conta_definir_senha recebe erro de permissão', async () => {
    const { db } = aberto;
    await db.query('BEGIN');
    try {
      await db.query('SET LOCAL ROLE pelada_app');
      await expect(db.query(`SELECT conta_definir_senha('conta-a@exemplo.test', 'x', false)`)).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await db.query('ROLLBACK');
    }
  });
});
