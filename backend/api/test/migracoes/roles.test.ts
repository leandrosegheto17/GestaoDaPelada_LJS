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
// Grants de tabela das tabelas de conta (conta-e-acesso, design C1). `contas` tem só grants de coluna (abaixo).
const DE_CONTA: Record<string, string[]> = {
  auditoria: ['INSERT'],
  convites_admin: ['SELECT', 'INSERT', 'UPDATE'],
  sessoes: ['SELECT', 'DELETE'],
};
// Colunas de `contas` que pelada_app lê (todas menos senha_hash) e a única que altera.
const CONTAS_LEGIVEIS = [
  'aviso_privacidade_visto_em',
  'criada_em',
  'e_dono',
  'email',
  'email_confirmado_em',
  'excluida_em',
  'id',
  'nome',
  'senha_temporaria',
  'termos_aceitos_em',
  'termos_versao',
];
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

  // Motivo da mudança (conta-e-acesso, T7): as tabelas de conta ganham os grants do design C1 (DE_CONTA).
  it('pelada_app: SELECT, INSERT e UPDATE nas tabelas de negócio, DELETE só nas listadas, os de conta, nada nas demais', async () => {
    const esperado: Record<string, string[]> = {};
    for (const tabela of todasAsTabelas) {
      esperado[tabela] = DE_CONTA[tabela]
        ? DE_CONTA[tabela]
        : !NEGOCIO.includes(tabela)
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

  // Motivo da mudança (conta-e-acesso, T7): `contas` e `sessoes` saem desta lista porque passam a ser lidas pela
  // própria conta (ACE-43, ACE-44; provado em test/isolamento/contas.test.ts); entram as tabelas de apoio novas.
  it.each([
    'tentativas_login',
    'pedidos_reset',
    'auditoria',
    'eventos_uso',
    'pgmigrations',
    'links_conta',
    'envios_email',
    // T61 (ACE-70): falhas da senha atual por conta.
    'falhas_senha_atual',
    // T63 (ACE-72): total de e-mails do dia; só a função do teto toca.
    'envios_email_dia',
    // T66 (ACE-73): pedidos de e-mail por origem; só a função do teto por origem toca.
    'pedidos_email_origem',
  ])('pelada_app não lê nem apaga %s (sem grant de leitura)', async (tabela) => {
    await comoRole(cliente, 'pelada_app', async () => {
      expect(await codigoDoErro(cliente, `SELECT 1 FROM ${tabela}`)).toBe(SEM_PRIVILEGIO);
      expect(await codigoDoErro(cliente, `DELETE FROM ${tabela}`)).toBe(SEM_PRIVILEGIO);
    });
  });

  it('pelada_app lê em contas todas as colunas menos senha_hash e altera só nome (ACE-43, ACE-44)', async () => {
    const { rows } = await cliente.query<{ coluna: string; ler: boolean; alterar: boolean; inserir: boolean }>(
      `SELECT a.attname AS coluna,
              has_column_privilege('pelada_app', 'public.contas', a.attname, 'SELECT') AS ler,
              has_column_privilege('pelada_app', 'public.contas', a.attname, 'UPDATE') AS alterar,
              has_column_privilege('pelada_app', 'public.contas', a.attname, 'INSERT') AS inserir
         FROM pg_attribute a
        WHERE a.attrelid = 'public.contas'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY 1`,
    );
    expect(rows.filter((r) => r.ler).map((r) => r.coluna)).toEqual(CONTAS_LEGIVEIS);
    expect(rows.filter((r) => r.alterar).map((r) => r.coluna)).toEqual(['nome']);
    expect(rows.filter((r) => r.inserir)).toEqual([]);
  });

  it('pelada_app insere em auditoria e não altera nem apaga (ACE-46)', async () => {
    // O cenário precisa de conta, grupo e vínculo (gravados como owner); a escrita é testada como pelada_app.
    await cliente.query('BEGIN');
    try {
      await cliente.query(
        `INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES
           ('00000000-0000-0000-0000-0000000000a1', 'auditoria@exemplo.com', 'Auditoria', 'x', now())`,
      );
      await cliente.query(
        `INSERT INTO grupos (id, nome, slug, dia_semana, frequencia, horario, criado_por, criado_em) VALUES
           ('00000000-0000-0000-0000-0000000000b1', 'Grupo auditoria', 'grupo-auditoria', 'quarta', 'semanal',
            '20:00', '00000000-0000-0000-0000-0000000000a1', now())`,
      );
      await cliente.query(
        `INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES
           ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
            '00000000-0000-0000-0000-0000000000a1', now())`,
      );
      await cliente.query('SET LOCAL ROLE pelada_app');
      await cliente.query("SELECT set_config('app.conta_id', '00000000-0000-0000-0000-0000000000a1', true)");
      expect(
        await codigoDoErro(
          cliente,
          `INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, grupo_id, momento) VALUES
             ('conta', '00000000-0000-0000-0000-0000000000a1', 'criar', 'grupo',
              '00000000-0000-0000-0000-0000000000b1', now())`,
        ),
      ).toBeNull();
      expect(await codigoDoErro(cliente, "UPDATE auditoria SET acao = 'outra'")).toBe(SEM_PRIVILEGIO);
      expect(await codigoDoErro(cliente, 'DELETE FROM auditoria')).toBe(SEM_PRIVILEGIO);
      await cliente.query('RESET ROLE');
      const { rows } = await cliente.query<{ acao: string }>('SELECT acao FROM auditoria');
      expect(rows).toEqual([{ acao: 'criar' }]);
    } finally {
      await cliente.query('ROLLBACK');
    }
  });

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
  return [
    ...NEGOCIO,
    'auditoria',
    'contas',
    'eventos_uso',
    'pedidos_reset',
    'sessoes',
    'tentativas_login',
    'convites_admin',
    'links_conta',
    'envios_email',
    'falhas_senha_atual',
    // T63 (ACE-72): teto diário de e-mails.
    'envios_email_dia',
    // T66 (ACE-73): teto de e-mails por origem.
    'pedidos_email_origem',
  ];
}
