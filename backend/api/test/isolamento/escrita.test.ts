import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, type CenarioAberto } from './apoio.ts';
import {
  conteudo,
  ESCRITA,
  escritaDe,
  ident as q,
  idsDoGrupo,
  RLS,
  SEM_GRANT,
  tentar as tentarComo,
  type IdsDoGrupo,
  type Tentativa,
} from './casos-escrita.ts';
import { MATRIZ } from './matriz.ts';

/**
 * Matriz de escrita (FUN-17): para cada caso da matriz, INSERT, UPDATE e DELETE da conta B
 * sobre o grupo da conta A, inclusive UPDATE e DELETE sem WHERE, e o caso de controle da
 * conta A (prova que o comando é válido e que a recusa de B vem da RLS ou do grant).
 * O conteúdo do grupo A é lido dentro da transação da tentativa (veja `tentar`).
 */

let aberto: CenarioAberto;
let idsA: IdsDoGrupo;
let antesA: Record<string, string>;
let linhasB: Record<string, number>;

beforeAll(async () => {
  aberto = await abrirCenario();
  const { db, cenario } = aberto;
  idsA = await idsDoGrupo(db, cenario.grupoA);
  antesA = await conteudo(db, cenario.grupoA);
  linhasB = {};
  for (const { tabela, coluna } of MATRIZ) {
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${q(db, tabela)} WHERE ${q(db, coluna)} = $1`,
      [cenario.grupoB],
    );
    linhasB[tabela] = r.rows[0]?.n ?? 0;
  }
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Tenta o comando como `pelada_app` com a conta dada, observando o grupo A. */
function tentar(conta: string, sql: string, valores: unknown[] = []): Promise<Tentativa> {
  return tentarComo(aberto.db, { conta }, aberto.cenario.grupoA, sql, valores);
}

function esperaRecusa(t: Tentativa, motivo: RegExp): void {
  expect(t.erro?.code, t.erro?.message ?? `afetou ${t.linhas} linha(s)`).toBe('42501');
  expect(t.erro?.message).toMatch(motivo);
  expect(t.observado).toEqual(antesA);
}

function esperaZero(t: Tentativa): void {
  expect(t.erro, t.erro?.message).toBeNull();
  expect(t.linhas).toBe(0);
  expect(t.observado).toEqual(antesA);
}

describe('FUN-17: a matriz de escrita cobre a matriz', () => {
  it('FUN-17: há caso de escrita para cada tabela da matriz, e só para elas', () => {
    expect(Object.keys(ESCRITA).sort()).toEqual(MATRIZ.map((c) => c.tabela).sort());
  });

  it('FUN-17: os grants declarados nos casos são os do banco', async () => {
    const { db } = aberto;
    for (const { tabela } of MATRIZ) {
      const e = escritaDe({ tabela });
      const r = await db.query<{ insere: boolean; altera: boolean; apaga: boolean }>(
        `SELECT has_table_privilege('pelada_app', $1, 'INSERT') AS insere,
                (has_table_privilege('pelada_app', $1, 'UPDATE')
                 OR has_any_column_privilege('pelada_app', $1, 'UPDATE')) AS altera,
                has_table_privilege('pelada_app', $1, 'DELETE') AS apaga`,
        [`public.${tabela}`],
      );
      expect(r.rows[0], tabela).toEqual({ insere: e.insere, altera: e.altera, apaga: e.apaga });
    }
  });
});

describe.each(MATRIZ)('FUN-17: escrita em $tabela', (caso) => {
  const e = escritaDe(caso);
  const col = caso.coluna;
  const tab = caso.tabela;

  it('FUN-17: INSERT da conta B no grupo A é recusado e o grupo A fica idêntico', async () => {
    const { cenario } = aberto;
    const [sql, valores] = e.inserir(cenario.grupoA, cenario.contaB, idsA);
    esperaRecusa(await tentar(cenario.contaB, sql, valores), e.insere ? RLS : SEM_GRANT);
  });

  it('FUN-17: controle, o mesmo INSERT pela conta A não é barrado pela RLS', async () => {
    const { cenario } = aberto;
    const [sql, valores] = e.inserir(cenario.grupoA, cenario.contaA, idsA);
    const t = await tentar(cenario.contaA, sql, valores);
    if (!e.insere || e.donoInsere === false) {
      expect(t.erro?.code).toBe('42501');
      return;
    }
    // Sucesso, ou erro de outra natureza (unicidade): nunca 42501.
    if (t.erro) expect(t.erro.code, t.erro.message).not.toBe('42501');
    else expect(t.linhas).toBe(1);
  });

  it('FUN-17: UPDATE da conta B com WHERE no grupo A afeta zero linhas', async () => {
    const { db, cenario } = aberto;
    const t = await tentar(cenario.contaB, `UPDATE ${q(db, tab)} SET ${e.alterar} WHERE ${q(db, col)} = $1`, [
      cenario.grupoA,
    ]);
    if (e.altera) esperaZero(t);
    else esperaRecusa(t, SEM_GRANT);
  });

  it('FUN-17: UPDATE da conta B sem WHERE não altera nenhuma linha do grupo A', async () => {
    const { db, cenario } = aberto;
    const t = await tentar(cenario.contaB, `UPDATE ${q(db, tab)} SET ${e.alterar}`);
    if (!e.altera) {
      esperaRecusa(t, SEM_GRANT);
      return;
    }
    expect(t.erro, t.erro?.message).toBeNull();
    expect(t.linhas).toBe(linhasB[tab]);
    expect(t.observado).toEqual(antesA);
  });

  it('FUN-17: UPDATE da conta B que move as próprias linhas para o grupo A é recusado', async () => {
    const { db, cenario } = aberto;
    // Sem WHERE de propósito: com WHERE sobre colunas, o Postgres também confere a linha nova
    // contra a policy de SELECT, e a recusa não provaria o WITH CHECK da policy de UPDATE.
    const t = await tentar(cenario.contaB, `UPDATE ${q(db, tab)} SET ${q(db, col)} = $1`, [cenario.grupoA]);
    expect(t.erro?.code, t.erro?.message ?? `afetou ${t.linhas} linha(s)`).toBe('42501');
    expect(t.observado).toEqual(antesA);
  });

  it('FUN-17: controle, o mesmo UPDATE pela conta A altera o grupo A', async () => {
    const { db, cenario } = aberto;
    const t = await tentar(cenario.contaA, `UPDATE ${q(db, tab)} SET ${e.alterar} WHERE ${q(db, col)} = $1`, [
      cenario.grupoA,
    ]);
    if (!e.altera) {
      expect(t.erro?.code).toBe('42501');
      return;
    }
    expect(t.erro, t.erro?.message).toBeNull();
    expect(t.linhas).toBeGreaterThanOrEqual(1);
    expect(t.observado).not.toEqual(antesA);
  });

  it('FUN-17: DELETE da conta B com WHERE no grupo A afeta zero linhas', async () => {
    const { db, cenario } = aberto;
    const t = await tentar(cenario.contaB, `DELETE FROM ${q(db, tab)} WHERE ${q(db, col)} = $1`, [cenario.grupoA]);
    if (e.apaga) esperaZero(t);
    else esperaRecusa(t, SEM_GRANT);
  });

  it('FUN-17: DELETE da conta B sem WHERE não apaga nenhuma linha do grupo A', async () => {
    const { db, cenario } = aberto;
    const t = await tentar(cenario.contaB, `DELETE FROM ${q(db, tab)}`);
    if (!e.apaga) {
      esperaRecusa(t, SEM_GRANT);
      return;
    }
    // Apaga só as linhas de B, ou para numa chave estrangeira de outra tabela de B; nunca toca o grupo A.
    if (t.erro) expect(t.erro.code, t.erro.message).not.toBe('42501');
    else expect(t.linhas).toBe(linhasB[tab]);
    expect(t.observado).toEqual(antesA);
  });
});

describe('FUN-17: a matriz de escrita pega um WITH CHECK aberto', () => {
  /** Troca a policy, tenta como a conta B e desfaz tudo na mesma transação. */
  async function comPolicyAberta(alteracao: string, sql: string, valores: unknown[]): Promise<number> {
    const { db, cenario } = aberto;
    await db.query('BEGIN');
    try {
      await db.query(alteracao);
      await db.query('SET LOCAL ROLE pelada_app');
      await db.query(`SELECT set_config('app.conta_id', $1, true)`, [cenario.contaB]);
      return (await db.query(sql, valores)).rowCount ?? 0;
    } finally {
      await db.query('ROLLBACK');
    }
  }

  it('FUN-17: com WITH CHECK (true) em habilidades_inserir, o INSERT de B no grupo A passa; revertido, volta a ser recusado', async () => {
    const { cenario } = aberto;
    const [sql, valores] = escritaDe({ tabela: 'habilidades' }).inserir(cenario.grupoA, cenario.contaB, idsA);
    expect(await comPolicyAberta('ALTER POLICY habilidades_inserir ON habilidades WITH CHECK (true)', sql, valores)).toBe(1);
    esperaRecusa(await tentar(cenario.contaB, sql, valores), RLS);
  });

  it('FUN-17: com WITH CHECK (true) em convites_admin_alterar, B move o próprio convite para o grupo A; revertido, volta a ser recusado', async () => {
    const { cenario } = aberto;
    // O mesmo comando do caso "move as próprias linhas" da matriz.
    const sql = 'UPDATE convites_admin SET grupo_id = $1';
    const valores = [cenario.grupoA];
    expect(
      await comPolicyAberta('ALTER POLICY convites_admin_alterar ON convites_admin WITH CHECK (true)', sql, valores),
    ).toBeGreaterThanOrEqual(1);
    const t = await tentar(cenario.contaB, sql, valores);
    expect(t.erro?.code).toBe('42501');
    expect(t.observado).toEqual(antesA);
  });
});
