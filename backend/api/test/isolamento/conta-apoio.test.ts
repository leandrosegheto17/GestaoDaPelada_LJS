import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from './apoio.ts';
import { abrirCenarioConta, criarLink, criarSessao, IP_HASH_1, sha256, type CenarioContaAberto } from './cenario-conta.ts';

/**
 * Matriz de `convites_admin`, `auditoria`, das tabelas de apoio e da role de backup
 * (T2; ACE-45, ACE-46). Policies em `1792843380000_conta-tabelas.sql:55-101`; tabelas em
 * `1792843800000`, `1792843860000` e `1792843980000`; role renomeada para `pelada_backup_ro`
 * em `1792844220000_roles-padronizadas.sql` (AD-016).
 */

const PERMISSAO = { code: '42501' };

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
  const { db, cenario } = aberto;
  // Uma linha em cada tabela de apoio, para a leitura do backup ter o que ler.
  await criarSessao(db, cenario.contaA);
  await criarLink(db, cenario.contaA, 'recuperacao');
  await db.query(`INSERT INTO tentativas_login (email, ip_hash, momento, sucesso) VALUES ($1, $2, now(), false)`, [
    cenario.emailA,
    IP_HASH_1,
  ]);
  await db.query(`INSERT INTO envios_email (destino_hash, tipo, enviado_em) VALUES ($1, 'confirmacao', now())`, [
    sha256(cenario.emailA),
  ]);
  await db.query(`INSERT INTO envios_email_dia (dia, total) VALUES (current_date, 1)`);
  await db.query(`INSERT INTO pedidos_email_origem (chave_hash, momento) VALUES ($1, now())`, [IP_HASH_1]);
  await db.query(`INSERT INTO falhas_senha_atual (conta_id, momento) VALUES ($1, now())`, [cenario.contaA]);
  await db.query(`INSERT INTO pedidos_reset (conta_id, ultimo_pedido_em) VALUES ($1, now())`, [cenario.contaA]);
});

afterAll(async () => {
  await aberto?.fechar();
});

async function comoSuperusuario<T>(db: pg.Client, fn: () => Promise<T>): Promise<T> {
  await db.query('RESET ROLE');
  return fn();
}

/** Roda `fn` numa transação como `pelada_backup_ro`, desfeita ao fim. */
async function comoBackup<T>(db: pg.Client, fn: (db: pg.Client) => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE pelada_backup_ro');
    return await fn(db);
  } finally {
    await db.query('ROLLBACK');
  }
}

async function contar(db: pg.Client, tabela: string): Promise<number> {
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${db.escapeIdentifier(tabela)}`);
  return r.rows[0]?.n ?? -1;
}

describe('convites_admin como pelada_app', () => {
  const ler = (d: pg.Client) => d.query<{ grupo_id: string }>('SELECT grupo_id, email FROM convites_admin');

  it('ACE-45: SELECT da conta A devolve só convites do grupo A', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaA }, ler);
    expect(r.rowCount).toBeGreaterThan(0);
    expect([...new Set(r.rows.map((l) => l.grupo_id))]).toEqual([cenario.grupoA]);
  });

  it('ACE-45: SELECT da conta B devolve só convites do grupo B', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaB }, ler);
    expect([...new Set(r.rows.map((l) => l.grupo_id))]).toEqual([cenario.grupoB]);
  });

  it('ACE-45: só com o slug público, sem conta, o convite (que traz e-mail) não aparece', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { slug: cenario.slugA }, ler);
    expect(r.rowCount).toBe(0);
  });

  it('ACE-45: SELECT sem contexto e da conta sem vínculo devolve zero', async () => {
    const { db, cenario } = aberto;
    expect((await comoApp(db, {}, ler)).rowCount).toBe(0);
    expect((await comoApp(db, { conta: cenario.contaSemVinculo }, ler)).rowCount).toBe(0);
  });

  const inserir = (grupo: string, criadoPor: string) => (d: pg.Client) =>
    d.query(
      `INSERT INTO convites_admin (grupo_id, email, token_hash, criado_por, criado_em, expira_em)
       VALUES ($1, 'novo@exemplo.test', gen_random_bytes(32), $2, now(), now() + interval '7 days')`,
      [grupo, criadoPor],
    );

  it('ACE-45: INSERT da conta A no grupo A é aceito', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaA }, inserir(cenario.grupoA, cenario.contaA));
    expect(r.rowCount).toBe(1);
  });

  it('ACE-45: INSERT da conta A no grupo B é recusado pela policy', async () => {
    const { db, cenario } = aberto;
    await expect(comoApp(db, { conta: cenario.contaA }, inserir(cenario.grupoB, cenario.contaA))).rejects.toMatchObject(
      PERMISSAO,
    );
  });

  it('ACE-45: INSERT só com o slug do grupo A, sem conta, é recusado', async () => {
    const { db, cenario } = aberto;
    await expect(comoApp(db, { slug: cenario.slugA }, inserir(cenario.grupoA, cenario.contaA))).rejects.toMatchObject(
      PERMISSAO,
    );
  });

  it('ACE-45: UPDATE que move o convite do grupo A para o grupo B é recusado pelo WITH CHECK', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) =>
        d.query('UPDATE convites_admin SET grupo_id = $1 WHERE grupo_id = $2', [cenario.grupoB, cenario.grupoA]),
      ),
    ).rejects.toMatchObject(PERMISSAO);
  });

  it('ACE-45: UPDATE da conta B sobre os convites do grupo A afeta 0 linhas', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaB }, (d) =>
      d.query('UPDATE convites_admin SET cancelado_em = now() WHERE grupo_id = $1', [cenario.grupoA]),
    );
    expect(r.rowCount).toBe(0);
  });

  it('ACE-45: UPDATE sem WHERE da conta A afeta só os convites do grupo A', async () => {
    const { db, cenario } = aberto;
    const deA = await comoSuperusuario(db, async () => {
      const r = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM convites_admin WHERE grupo_id = $1', [
        cenario.grupoA,
      ]);
      return r.rows[0]?.n ?? 0;
    });
    const cancelados = await comoApp(db, { conta: cenario.contaA }, async (d) => {
      const r = await d.query('UPDATE convites_admin SET cancelado_em = now()');
      expect(r.rowCount).toBe(deA);
      return comoSuperusuario(d, () =>
        d.query<{ grupo_id: string }>('SELECT DISTINCT grupo_id FROM convites_admin WHERE cancelado_em IS NOT NULL'),
      );
    });
    expect(cancelados.rows.map((l) => l.grupo_id)).toEqual([cenario.grupoA]);
  });

  it('ACE-45: UPDATE só com o slug, sem conta, afeta 0 linhas', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { slug: cenario.slugA }, (d) => d.query('UPDATE convites_admin SET cancelado_em = now()'));
    expect(r.rowCount).toBe(0);
  });

  it('ACE-45: DELETE em convites_admin é recusado (cancelar é marcar cancelado_em)', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) => d.query('DELETE FROM convites_admin WHERE grupo_id = $1', [cenario.grupoA])),
    ).rejects.toMatchObject(PERMISSAO);
  });
});

describe('auditoria como pelada_app', () => {
  const inserir = (grupo: string, conta: string) => (d: pg.Client) =>
    d.query(
      `INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento)
       VALUES ('conta', $1, 'teste', 'grupo', $2::text, $2, now())`,
      [conta, grupo],
    );

  it('ACE-46: INSERT da conta A na auditoria do grupo A é aceito', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaA }, inserir(cenario.grupoA, cenario.contaA));
    expect(r.rowCount).toBe(1);
  });

  it('ACE-46: INSERT da conta A na auditoria do grupo B é recusado pela policy de grupo', async () => {
    const { db, cenario } = aberto;
    await expect(comoApp(db, { conta: cenario.contaA }, inserir(cenario.grupoB, cenario.contaA))).rejects.toMatchObject(
      PERMISSAO,
    );
  });

  it('ACE-46: SELECT na auditoria é recusado (B nunca lê a de A)', async () => {
    const { db, cenario } = aberto;
    await expect(comoApp(db, { conta: cenario.contaB }, (d) => d.query('SELECT id FROM auditoria'))).rejects.toMatchObject(
      PERMISSAO,
    );
  });

  it('ACE-46: UPDATE na auditoria é recusado, mesmo no próprio grupo', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) =>
        d.query(`UPDATE auditoria SET acao = 'apagada' WHERE grupo_id = $1`, [cenario.grupoA]),
      ),
    ).rejects.toMatchObject(PERMISSAO);
  });

  it('ACE-46: DELETE na auditoria é recusado, mesmo no próprio grupo', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) => d.query('DELETE FROM auditoria WHERE grupo_id = $1', [cenario.grupoA])),
    ).rejects.toMatchObject(PERMISSAO);
  });
});

/** As 7 tabelas de apoio, com uma coluna para o UPDATE. Só as funções do banco as tocam. */
const APOIO: ReadonlyArray<readonly [string, string]> = [
  ['tentativas_login', 'sucesso'],
  ['links_conta', 'usado_em'],
  ['envios_email', 'enviado_em'],
  ['envios_email_dia', 'total'],
  ['pedidos_email_origem', 'momento'],
  ['falhas_senha_atual', 'momento'],
  ['pedidos_reset', 'resolvido_em'],
];

describe.each(APOIO)('%s como pelada_app', (tabela, coluna) => {
  const comandos: ReadonlyArray<readonly [string, string]> = [
    ['SELECT', `SELECT count(*) FROM ${tabela}`],
    ['INSERT', `INSERT INTO ${tabela} DEFAULT VALUES`],
    ['UPDATE', `UPDATE ${tabela} SET ${coluna} = ${coluna}`],
    ['DELETE', `DELETE FROM ${tabela}`],
  ];

  it.each(comandos)(`ACE-45: %s em ${tabela} é recusado com a conta A`, async (_comando, sql) => {
    const { db, cenario } = aberto;
    await expect(comoApp(db, { conta: cenario.contaA }, (d) => d.query(sql))).rejects.toMatchObject({
      ...PERMISSAO,
      message: expect.stringContaining(`permission denied for table ${tabela}`),
    });
  });

  it.each(comandos)(`ACE-45: %s em ${tabela} é recusado sem contexto`, async (_comando, sql) => {
    const { db } = aberto;
    await expect(comoApp(db, {}, (d) => d.query(sql))).rejects.toMatchObject(PERMISSAO);
  });
});

/** Toda tabela de conta e as de grupo que esta feature toca: o backup lê todas. */
const LIDAS_PELO_BACKUP = [
  'contas',
  'sessoes',
  'convites_admin',
  'auditoria',
  ...APOIO.map(([t]) => t),
];

describe.each(LIDAS_PELO_BACKUP)('%s como pelada_backup_ro', (tabela) => {
  it(`ACE-45: o backup lê todas as linhas de ${tabela}`, async () => {
    const { db } = aberto;
    const total = await contar(db, tabela);
    expect(total).toBeGreaterThan(0);
    expect(await comoBackup(db, (d) => contar(d, tabela))).toBe(total);
  });

  it(`ACE-45: o backup não apaga nem altera ${tabela}`, async () => {
    const { db } = aberto;
    await expect(comoBackup(db, (d) => d.query(`DELETE FROM ${tabela}`))).rejects.toMatchObject(PERMISSAO);
    await expect(comoBackup(db, (d) => d.query(`INSERT INTO ${tabela} DEFAULT VALUES`))).rejects.toMatchObject(PERMISSAO);
  });
});

describe('pelada_backup_ro também não altera', () => {
  it.each([
    ['contas', 'nome'],
    ['sessoes', 'expira_em'],
    ['convites_admin', 'cancelado_em'],
    ['auditoria', 'acao'],
    ...APOIO,
  ] as const)('ACE-45: UPDATE em %s é recusado', async (tabela, coluna) => {
    const { db } = aberto;
    await expect(comoBackup(db, (d) => d.query(`UPDATE ${tabela} SET ${coluna} = ${coluna}`))).rejects.toMatchObject(
      PERMISSAO,
    );
  });

  it('ACE-45: a role antiga pelada_backup não existe mais neste banco (renomeada)', async () => {
    const { db } = aberto;
    const r = await db.query(
      `SELECT 1 FROM pg_policy p JOIN pg_roles r ON r.oid = ANY (p.polroles) WHERE r.rolname = 'pelada_backup'`,
    );
    expect(r.rowCount).toBe(0);
  });
});
