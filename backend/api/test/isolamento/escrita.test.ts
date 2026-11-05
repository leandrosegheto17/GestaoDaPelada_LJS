import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, comoApp, type CenarioAberto } from './apoio.ts';
import { MATRIZ, type CasoMatriz } from './matriz.ts';

/**
 * Matriz de escrita (FUN-17): para cada caso da matriz, INSERT, UPDATE e DELETE da conta B
 * sobre o grupo da conta A, inclusive UPDATE e DELETE sem WHERE, e o caso de controle da
 * conta A (prova que o comando é válido e que a recusa de B vem da RLS ou do grant).
 *
 * O conteúdo do grupo A é lido na mesma transação da tentativa, depois de `RESET ROLE`
 * (superusuário, sem RLS), antes do ROLLBACK do `comoApp`: ler depois do ROLLBACK
 * esconderia uma escrita que vazou.
 */

interface IdsDoGrupo {
  jogador: string;
  habilidade: string;
  partida: string;
}

interface Escrita {
  /** Grants de `pelada_app` na tabela (migrações roles, conta-tabelas e grupos-grants-coluna). */
  insere: boolean;
  altera: boolean;
  apaga: boolean;
  /** INSERT de uma linha nova no grupo dado, em nome da conta dada. */
  inserir: (grupo: string, conta: string, ids: IdsDoGrupo) => [string, unknown[]];
  /** Cláusula SET de uma mudança real de conteúdo, em coluna com grant. */
  alterar: string;
  /** A conta dona do grupo insere direto. Falso em `grupos`: o grupo nasce só pela `grupo_criar`. */
  donoInsere?: boolean;
}

const ESCRITA: Record<string, Escrita> = {
  auditoria: {
    insere: true,
    altera: false,
    apaga: false,
    inserir: (g, c) => [
      `INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, grupo_id, momento)
       VALUES ('conta', $2, 'intrusa', 'grupo', $1, now())`,
      [g, c],
    ],
    alterar: `resumo = '{"intrusa": true}'::jsonb`,
  },
  config_financeira: {
    insere: true,
    altera: true,
    apaga: false,
    inserir: (g) => [
      `INSERT INTO config_financeira (grupo_id, saldo_inicial_centavos, data_saldo_inicial) VALUES ($1, 1, '2026-02-01')`,
      [g],
    ],
    alterar: 'saldo_inicial_centavos = saldo_inicial_centavos + 1',
  },
  config_pesos: {
    insere: true,
    altera: true,
    apaga: false,
    inserir: (g, c) => [
      `INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva,
         lesionado_sem_chuva, lesionado_com_chuva, expulso, registrado_por, registrado_em)
       VALUES ($1, '2026-02-01', 1, 1, 1, 1, -1, $2, now())`,
      [g, c],
    ],
    alterar: 'expulso = -2',
  },
  convites_admin: {
    insere: true,
    altera: true,
    apaga: false,
    inserir: (g, c) => [
      `INSERT INTO convites_admin (grupo_id, email, token_hash, criado_por, criado_em, expira_em)
       VALUES ($1, 'intrusa@exemplo.test', gen_random_bytes(32), $2, now(), now() + interval '1 day')`,
      [g, c],
    ],
    alterar: 'cancelado_em = now()',
  },
  escalacoes: {
    insere: true,
    altera: true,
    apaga: true,
    inserir: (g, c) => [
      `INSERT INTO escalacoes (grupo_id, data, formato, n, composicao, confirmada_por, confirmada_em)
       VALUES ($1, '2026-02-07', 'dois_times', 5, '{}'::jsonb, $2, now())`,
      [g, c],
    ],
    alterar: 'n = 6',
  },
  eventos_uso: {
    insere: false,
    altera: false,
    apaga: false,
    inserir: (g) => [
      `INSERT INTO eventos_uso (grupo_id, tipo, momento, data_partida) VALUES ($1, 'partida_lancada', now(), '2026-02-07')`,
      [g],
    ],
    alterar: 'momento = now()',
  },
  grupos: {
    insere: true,
    altera: true,
    apaga: false,
    donoInsere: false,
    inserir: (_g, c) => [
      `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
       VALUES ('Grupo Intruso', 'grupo-intruso', 'domingo', 'semanal', '10:00', $1, now())`,
      [c],
    ],
    alterar: `nome = 'Grupo Alterado'`,
  },
  habilidades: {
    insere: true,
    altera: true,
    apaga: true,
    inserir: (g) => [`INSERT INTO habilidades (grupo_id, nome) VALUES ($1, 'Intrusa')`, [g]],
    alterar: `nome = 'Alterada'`,
  },
  jogadores: {
    insere: true,
    altera: true,
    apaga: true,
    inserir: (g, c) => [
      `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'Intruso', $2, now(), $2, now())`,
      [g, c],
    ],
    alterar: `apelido = 'Alterado'`,
  },
  lancamentos: {
    insere: true,
    altera: true,
    apaga: true,
    inserir: (g, c) => [
      `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'saida', '2026-02-07', 'Intrusa', 100, $2, now(), $2, now())`,
      [g, c],
    ],
    alterar: 'valor_centavos = valor_centavos + 1',
  },
  notas: {
    insere: true,
    altera: true,
    apaga: true,
    inserir: (g, _c, ids) => [
      `INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor) VALUES ($2, $3, $1, 7)`,
      [g, ids.jogador, ids.habilidade],
    ],
    alterar: 'valor = 9',
  },
  pagamentos_mes: {
    insere: true,
    altera: true,
    apaga: true,
    inserir: (g, c, ids) => [
      `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, marcado_por, marcado_em) VALUES ($1, $2, '2026-02', $3, now())`,
      [g, ids.jogador, c],
    ],
    alterar: `mes = '2026-03'`,
  },
  partidas: {
    insere: true,
    altera: true,
    apaga: true,
    inserir: (g, c) => [
      `INSERT INTO partidas (grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
       VALUES ($1, '2026-02-07', $2, now(), $2, now())`,
      [g, c],
    ],
    alterar: 'choveu = NOT choveu',
  },
  periodos_ativos: {
    insere: true,
    altera: true,
    apaga: false,
    inserir: (g, _c, ids) => [
      `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($2, $1, '2025-06-01', '2025-06-30')`,
      [g, ids.jogador],
    ],
    alterar: `inicio = '2025-12-01'`,
  },
  presencas: {
    insere: true,
    altera: true,
    apaga: true,
    inserir: (g, _c, ids) => [
      `INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($2, $3, $1, 'expulso')`,
      [g, ids.partida, ids.jogador],
    ],
    alterar: `situacao = 'lesionado'`,
  },
  vinculos_admin: {
    insere: true,
    altera: true,
    apaga: true,
    // A conta que age tenta se dar vínculo no grupo: a escalada de privilégio clássica.
    inserir: (g, c) => [
      `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em) VALUES ($2, $1, true, $2, now())`,
      [g, c],
    ],
    alterar: 'acessa_financeiro = NOT acessa_financeiro',
  },
};

let aberto: CenarioAberto;
let idsA: IdsDoGrupo;
let antesA: Record<string, string>;
let linhasB: Record<string, number>;

const q = (db: pg.Client, nome: string) => db.escapeIdentifier(nome);

/** Conteúdo do grupo em toda tabela da matriz, como texto JSON ordenado. Exige superusuário. */
async function conteudo(db: pg.Client, grupo: string): Promise<Record<string, string>> {
  const r: Record<string, string> = {};
  for (const { tabela, coluna } of MATRIZ) {
    const s = await db.query<{ j: string }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)::text AS j
         FROM ${q(db, tabela)} t WHERE t.${q(db, coluna)} = $1`,
      [grupo],
    );
    r[tabela] = s.rows[0]?.j ?? '[]';
  }
  return r;
}

async function primeiroId(db: pg.Client, tabela: string, grupo: string): Promise<string> {
  const r = await db.query<{ id: string }>(`SELECT id FROM ${q(db, tabela)} WHERE grupo_id = $1 LIMIT 1`, [grupo]);
  const id = r.rows[0]?.id;
  if (!id) throw new Error(`Cenário sem linha em ${tabela}`);
  return id;
}

beforeAll(async () => {
  aberto = await abrirCenario();
  const { db, cenario } = aberto;
  idsA = {
    jogador: await primeiroId(db, 'jogadores', cenario.grupoA),
    habilidade: await primeiroId(db, 'habilidades', cenario.grupoA),
    partida: await primeiroId(db, 'partidas', cenario.grupoA),
  };
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

interface Tentativa {
  linhas: number | null;
  erro: { code?: string; message: string } | null;
  /** Conteúdo do grupo A lido na mesma transação, depois da tentativa. */
  grupoA: Record<string, string>;
}

/** Roda o comando como `pelada_app` com a conta dada e lê o grupo A antes do ROLLBACK. */
async function tentar(conta: string, sql: string, valores: unknown[] = []): Promise<Tentativa> {
  const { db, cenario } = aberto;
  return comoApp(db, { conta }, async (d) => {
    let linhas: number | null = null;
    let erro: Tentativa['erro'] = null;
    await d.query('SAVEPOINT tentativa');
    try {
      linhas = (await d.query(sql, valores)).rowCount ?? 0;
      await d.query('RELEASE SAVEPOINT tentativa');
    } catch (e) {
      const x = e as pg.DatabaseError;
      erro = { code: x.code, message: x.message };
      await d.query('ROLLBACK TO SAVEPOINT tentativa');
    }
    await d.query('RESET ROLE');
    return { linhas, erro, grupoA: await conteudo(d, cenario.grupoA) };
  });
}

const RLS = /row-level security/;
const SEM_GRANT = /permission denied/;

function esperaRecusa(t: Tentativa, motivo: RegExp): void {
  expect(t.erro?.code, t.erro?.message ?? `afetou ${t.linhas} linha(s)`).toBe('42501');
  expect(t.erro?.message).toMatch(motivo);
  expect(t.grupoA).toEqual(antesA);
}

function esperaZero(t: Tentativa): void {
  expect(t.erro, t.erro?.message).toBeNull();
  expect(t.linhas).toBe(0);
  expect(t.grupoA).toEqual(antesA);
}

function escritaDe(caso: CasoMatriz): Escrita {
  const e = ESCRITA[caso.tabela];
  if (!e) throw new Error(`${caso.tabela}: sem caso de escrita`);
  return e;
}

describe('FUN-17: a matriz de escrita cobre a matriz', () => {
  it('FUN-17: há caso de escrita para cada tabela da matriz, e só para elas', () => {
    expect(Object.keys(ESCRITA).sort()).toEqual(MATRIZ.map((c) => c.tabela).sort());
  });

  it('FUN-17: os grants declarados aqui são os do banco', async () => {
    const { db } = aberto;
    for (const { tabela } of MATRIZ) {
      const e = escritaDe({ tabela, coluna: 'grupo_id', leitura: 'por-grupo' });
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
    expect(t.grupoA).toEqual(antesA);
  });

  it('FUN-17: UPDATE da conta B que move as próprias linhas para o grupo A é recusado', async () => {
    const { db, cenario } = aberto;
    // Sem WHERE de propósito: com WHERE sobre colunas, o Postgres também confere a linha nova
    // contra a policy de SELECT, e a recusa não provaria o WITH CHECK da policy de UPDATE.
    const t = await tentar(cenario.contaB, `UPDATE ${q(db, tab)} SET ${q(db, col)} = $1`, [cenario.grupoA]);
    expect(t.erro?.code, t.erro?.message ?? `afetou ${t.linhas} linha(s)`).toBe('42501');
    expect(t.grupoA).toEqual(antesA);
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
    expect(t.grupoA).not.toEqual(antesA);
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
    expect(t.grupoA).toEqual(antesA);
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
    const [sql, valores] = escritaDe({ tabela: 'habilidades', coluna: 'grupo_id', leitura: 'por-grupo' }).inserir(
      cenario.grupoA,
      cenario.contaB,
      idsA,
    );
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
    expect(t.grupoA).toEqual(antesA);
  });
});
