import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASTA_MIGRACOES } from '../../src/infraestrutura/db/migracoes/executar.ts';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { codigoDoErro, comoRole } from '../apoio/como-role.ts';

const SEM_PRIVILEGIO = '42501';

// Design C3: tabelas de negócio do runtime e, entre elas, as que podem ter DELETE.
const NEGOCIO = [
  'config_financeira',
  'config_pesos',
  'escalacoes',
  'grupos',
  'habilidades',
  'jogadores',
  'lancamentos',
  'notas',
  'pagamentos_mes',
  'partidas',
  'periodos_ativos',
  'presencas',
  'vinculos_admin',
];
const COM_DELETE = [
  'escalacoes',
  'habilidades',
  'jogadores',
  'lancamentos',
  'notas',
  'pagamentos_mes',
  'partidas',
  'presencas',
  'vinculos_admin',
];
const SEM_DELETE = NEGOCIO.filter((t) => !COM_DELETE.includes(t));
const PRIVILEGIOS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] as const;

let banco: BancoTemporario;
let cliente: pg.Client;
let todasAsTabelas: string[];

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
  todasAsTabelas = (
    await cliente.query<{ t: string }>("SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")
  ).rows.map((r) => r.t);
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

async function privilegios(role: string): Promise<Record<string, string[]>> {
  const mapa: Record<string, string[]> = {};
  for (const tabela of todasAsTabelas) {
    const tem: string[] = [];
    for (const p of PRIVILEGIOS) {
      const r = await cliente.query<{ ok: boolean }>('SELECT has_table_privilege($1, $2, $3) AS ok', [
        role,
        `public.${tabela}`,
        p,
      ]);
      if (r.rows[0]?.ok) tem.push(p);
    }
    mapa[tabela] = tem;
  }
  return mapa;
}

describe('roles (FUN-11)', () => {
  it('a migration cria pelada_app e pelada_backup NOLOGIN NOBYPASSRLS, sem superusuário nem criação de role ou banco', async () => {
    // As roles são do servidor e podem já existir (com a senha local do seed). Para ver o que a migration cria,
    // renomeia-se as existentes numa transação, roda-se a migration de roles e desfaz-se tudo no fim.
    const sql = readFileSync(join(PASTA_MIGRACOES, '1792843260000_roles.sql'), 'utf8');
    await cliente.query('BEGIN');
    try {
      await cliente.query('ALTER ROLE pelada_app RENAME TO pelada_app_existente');
      await cliente.query('ALTER ROLE pelada_backup RENAME TO pelada_backup_existente');
      await cliente.query(sql);
      const { rows } = await cliente.query(
        `SELECT rolname, rolcanlogin, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, rolreplication
           FROM pg_roles WHERE rolname IN ('pelada_app', 'pelada_backup') ORDER BY rolname`,
      );
      const atributos = {
        rolcanlogin: false,
        rolbypassrls: false,
        rolsuper: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
      };
      expect(rows).toEqual([
        { rolname: 'pelada_app', ...atributos },
        { rolname: 'pelada_backup', ...atributos },
      ]);
    } finally {
      await cliente.query('ROLLBACK');
    }
  });

  it('nenhuma das duas roles tem bypass de RLS nem superusuário', async () => {
    const { rows } = await cliente.query(
      `SELECT rolname, rolbypassrls, rolsuper FROM pg_roles
        WHERE rolname IN ('pelada_app', 'pelada_backup') ORDER BY rolname`,
    );
    expect(rows).toEqual([
      { rolname: 'pelada_app', rolbypassrls: false, rolsuper: false },
      { rolname: 'pelada_backup', rolbypassrls: false, rolsuper: false },
    ]);
  });

  it('pelada_app: SELECT, INSERT e UPDATE nas tabelas de negócio, DELETE só nas listadas, nada nas demais', async () => {
    const esperado: Record<string, string[]> = {};
    for (const tabela of todasAsTabelas) {
      esperado[tabela] = !NEGOCIO.includes(tabela)
        ? []
        : COM_DELETE.includes(tabela)
          ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
          : ['SELECT', 'INSERT', 'UPDATE'];
    }
    expect(await privilegios('pelada_app')).toEqual(esperado);
    expect(todasAsTabelas).toEqual(expect.arrayContaining([...NEGOCIO, 'contas', 'sessoes', 'pgmigrations']));
  });

  it('pelada_app não faz DDL', async () => {
    await comoRole(cliente, 'pelada_app', async () => {
      expect(await codigoDoErro(cliente, 'CREATE TABLE intrusa (id int)')).toBe(SEM_PRIVILEGIO);
      expect(await codigoDoErro(cliente, 'ALTER TABLE jogadores ADD COLUMN intrusa text')).toBe(SEM_PRIVILEGIO);
      expect(await codigoDoErro(cliente, 'DROP TABLE presencas')).toBe(SEM_PRIVILEGIO);
      expect(await codigoDoErro(cliente, 'CREATE INDEX intruso ON jogadores (apelido)')).toBe(SEM_PRIVILEGIO);
      expect(await codigoDoErro(cliente, 'CREATE FUNCTION intrusa() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql')).toBe(
        SEM_PRIVILEGIO,
      );
    });
  });

  it.each(todasAsTabelas_())('pelada_app não faz TRUNCATE em %s', async (tabela) => {
    await comoRole(cliente, 'pelada_app', async () => {
      expect(await codigoDoErro(cliente, `TRUNCATE ${tabela}`)).toBe(SEM_PRIVILEGIO);
    });
  });

  it.each(SEM_DELETE)('pelada_app não faz DELETE em %s (fora da lista)', async (tabela) => {
    await comoRole(cliente, 'pelada_app', async () => {
      expect(await codigoDoErro(cliente, `DELETE FROM ${tabela}`)).toBe(SEM_PRIVILEGIO);
    });
  });

  it.each(['contas', 'sessoes', 'tentativas_login', 'pedidos_reset', 'auditoria', 'eventos_uso', 'pgmigrations'])(
    'pelada_app não lê nem apaga %s (sem grant na fundação)',
    async (tabela) => {
      await comoRole(cliente, 'pelada_app', async () => {
        expect(await codigoDoErro(cliente, `SELECT 1 FROM ${tabela}`)).toBe(SEM_PRIVILEGIO);
        expect(await codigoDoErro(cliente, `DELETE FROM ${tabela}`)).toBe(SEM_PRIVILEGIO);
      });
    },
  );

  it.each(COM_DELETE)('pelada_app pode DELETE em %s (na lista)', async (tabela) => {
    await comoRole(cliente, 'pelada_app', async () => {
      expect(await codigoDoErro(cliente, `DELETE FROM ${tabela} WHERE false`)).toBeNull();
    });
  });

  it('pelada_backup: só SELECT, em todas as tabelas', async () => {
    const esperado = Object.fromEntries(todasAsTabelas.map((t) => [t, ['SELECT']]));
    expect(await privilegios('pelada_backup')).toEqual(esperado);
  });

  it('pelada_backup não escreve nem faz DDL', async () => {
    await comoRole(cliente, 'pelada_backup', async () => {
      expect(await codigoDoErro(cliente, 'SELECT count(*) FROM contas')).toBeNull();
      expect(await codigoDoErro(cliente, "UPDATE grupos SET nome = 'x' WHERE false")).toBe(SEM_PRIVILEGIO);
      expect(await codigoDoErro(cliente, 'DELETE FROM jogadores WHERE false')).toBe(SEM_PRIVILEGIO);
      expect(await codigoDoErro(cliente, 'TRUNCATE presencas')).toBe(SEM_PRIVILEGIO);
      expect(await codigoDoErro(cliente, 'CREATE TABLE intrusa (id int)')).toBe(SEM_PRIVILEGIO);
    });
  });
});

/** Lista fixa para o `it.each` (a coleta acontece antes do `beforeAll`). */
function todasAsTabelas_(): string[] {
  return [...NEGOCIO, 'auditoria', 'contas', 'eventos_uso', 'pedidos_reset', 'sessoes', 'tentativas_login'];
}
