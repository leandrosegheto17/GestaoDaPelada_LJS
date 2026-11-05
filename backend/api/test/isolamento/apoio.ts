import type pg from 'pg';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';

/**
 * Apoio da suíte de isolamento (design C3; FUN-13, FUN-15, FUN-17).
 * Os testes conectam como o superusuário local (`postgres`) e trocam para `pelada_app`
 * com `SET LOCAL ROLE` dentro de uma transação, com o contexto da RLS da migração `rls`
 * (`app.conta_id` e `app.slug_publico`, 1792843320000_rls.sql).
 */

export interface Contexto {
  /** `app.conta_id`: a conta logada. Ausente = sem conta. */
  conta?: string | null;
  /** `app.slug_publico`: o slug da página pública. Ausente = sem slug. */
  slug?: string | null;
}

export interface OpcoesComoApp {
  /** Grava o que `fn` fez (COMMIT). Padrão: ROLLBACK, para o cenário não mudar entre os casos. */
  confirmar?: boolean;
}

/**
 * Roda `fn` numa transação como `pelada_app`, com o contexto dado. A role e o contexto
 * são locais à transação (`SET LOCAL`, `set_config(..., true)`): ao fim, a conexão volta a
 * ser do superusuário e sem contexto, inclusive quando `fn` lança erro.
 */
export async function comoApp<T>(
  db: pg.Client,
  contexto: Contexto,
  fn: (db: pg.Client) => Promise<T>,
  opcoes: OpcoesComoApp = {},
): Promise<T> {
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE pelada_app');
    await db.query(
      `SELECT set_config('app.conta_id', $1, true), set_config('app.slug_publico', $2, true)`,
      [contexto.conta ?? '', contexto.slug ?? ''],
    );
    const resultado = await fn(db);
    await db.query(opcoes.confirmar ? 'COMMIT' : 'ROLLBACK');
    return resultado;
  } catch (erro) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw erro;
  }
}

export interface TabelaComGrupo {
  tabela: string;
  /** `id` em `grupos`; `grupo_id` nas demais. */
  coluna: 'id' | 'grupo_id';
}

/**
 * Lista, pelo catálogo, `grupos` e toda tabela do schema public com a coluna `grupo_id`,
 * ordenada pelo nome. É a mesma regra do laço da migração `rls`.
 */
export async function tabelasComGrupo(db: pg.Client): Promise<TabelaComGrupo[]> {
  const r = await db.query<{ tabela: string }>(
    `SELECT c.relname::text AS tabela
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'grupo_id' AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
  );
  const lista: TabelaComGrupo[] = [
    { tabela: 'grupos', coluna: 'id' },
    ...r.rows.map((l) => ({ tabela: l.tabela, coluna: 'grupo_id' as const })),
  ];
  return lista.sort((a, b) => a.tabela.localeCompare(b.tabela));
}

export interface Cenario {
  contaA: string;
  contaB: string;
  /** Conta sem vínculo com nenhum grupo. */
  contaSemVinculo: string;
  grupoA: string;
  grupoB: string;
  slugA: string;
  slugB: string;
  /** As tabelas do catálogo que o cenário preencheu (inclui `grupos`). */
  tabelas: TabelaComGrupo[];
}

interface Semente {
  grupo: string;
  conta: string;
  /** Marca curta do grupo ('a' ou 'b'), para valores únicos. */
  marca: string;
  ids: Record<string, string>;
}

async function umId(db: pg.Client, sql: string, valores: unknown[]): Promise<string> {
  const r = await db.query<{ id: string }>(sql, valores);
  const id = r.rows[0]?.id;
  if (!id) throw new Error(`Inserção sem id: ${sql}`);
  return id;
}

/**
 * Uma linha por tabela com `grupo_id`, na ordem das chaves estrangeiras.
 * Tabela nova com `grupo_id` no catálogo sem entrada aqui faz o `criarCenario` falhar.
 */
const PREENCHER: ReadonlyArray<readonly [string, (db: pg.Client, s: Semente) => Promise<void>]> = [
  [
    'vinculos_admin',
    async (db, s) => {
      await db.query(
        `INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())`,
        [s.conta, s.grupo],
      );
    },
  ],
  [
    'jogadores',
    async (db, s) => {
      s.ids.jogador = await umId(
        db,
        `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
         VALUES ($1, $2, $3, now(), $3, now()) RETURNING id`,
        [s.grupo, `Jogador ${s.marca}`, s.conta],
      );
    },
  ],
  [
    'periodos_ativos',
    async (db, s) => {
      await db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`, [
        s.ids.jogador,
        s.grupo,
      ]);
    },
  ],
  [
    'habilidades',
    async (db, s) => {
      s.ids.habilidade = await umId(db, `INSERT INTO habilidades (grupo_id, nome) VALUES ($1, 'Chute') RETURNING id`, [
        s.grupo,
      ]);
    },
  ],
  [
    'notas',
    async (db, s) => {
      await db.query(`INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor) VALUES ($1, $2, $3, 5)`, [
        s.ids.jogador,
        s.ids.habilidade,
        s.grupo,
      ]);
    },
  ],
  [
    'config_pesos',
    async (db, s) => {
      await db.query(
        `INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva,
           lesionado_sem_chuva, lesionado_com_chuva, expulso, registrado_por, registrado_em)
         VALUES ($1, '2026-01-01', 3, 4, 1, 2, -1, $2, now())`,
        [s.grupo, s.conta],
      );
    },
  ],
  [
    'partidas',
    async (db, s) => {
      s.ids.partida = await umId(
        db,
        `INSERT INTO partidas (grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
         VALUES ($1, '2026-01-03', $2, now(), $2, now()) RETURNING id`,
        [s.grupo, s.conta],
      );
    },
  ],
  [
    'presencas',
    async (db, s) => {
      await db.query(
        `INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`,
        [s.ids.partida, s.ids.jogador, s.grupo],
      );
    },
  ],
  [
    'eventos_uso',
    async (db, s) => {
      await db.query(
        `INSERT INTO eventos_uso (grupo_id, tipo, momento, data_partida) VALUES ($1, 'partida_lancada', now(), '2026-01-03')`,
        [s.grupo],
      );
    },
  ],
  [
    'escalacoes',
    async (db, s) => {
      await db.query(
        `INSERT INTO escalacoes (grupo_id, data, formato, n, composicao, confirmada_por, confirmada_em)
         VALUES ($1, '2026-01-03', 'dois_times', 5, '{}'::jsonb, $2, now())`,
        [s.grupo, s.conta],
      );
    },
  ],
  [
    'config_financeira',
    async (db, s) => {
      await db.query(
        `INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial)
         VALUES ($1, 5000, 0, '2026-01-01')`,
        [s.grupo],
      );
    },
  ],
  [
    'lancamentos',
    async (db, s) => {
      s.ids.lancamento = await umId(
        db,
        `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
         VALUES ($1, 'entrada', '2026-01-05', 'Mensalidade', 5000, $2, now(), $2, now()) RETURNING id`,
        [s.grupo, s.conta],
      );
    },
  ],
  [
    'pagamentos_mes',
    async (db, s) => {
      await db.query(
        `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
         VALUES ($1, $2, '2026-01', $3, $4, now())`,
        [s.grupo, s.ids.jogador, s.ids.lancamento, s.conta],
      );
    },
  ],
  [
    'auditoria',
    async (db, s) => {
      await db.query(
        `INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento)
         VALUES ('conta', $1, 'teste', 'grupo', $2::text, $2, now())`,
        [s.conta, s.grupo],
      );
    },
  ],
  [
    'convites_admin',
    async (db, s) => {
      await db.query(
        `INSERT INTO convites_admin (grupo_id, email, token_hash, criado_por, criado_em, expira_em)
         VALUES ($1, $2, gen_random_bytes(32), $3, now(), now() + interval '1 day')`,
        [s.grupo, `convidado-${s.marca}@exemplo.test`, s.conta],
      );
    },
  ],
  [
    // planos-e-cobranca T10: uma assinatura cancelada de cada grupo. Cancelada para não ocupar o índice de vigente nem
    // travar arquivar e excluir conta (T38); o plano não muda: `grupos` segue com o default `uso_proprio`.
    'assinaturas',
    async (db, s) => {
      await db.query(
        `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, pago_ate,
           cobranca_pro_id, criada_por, criada_em)
         VALUES ($1, $2, $3, 990, 'cancelada', '2026-02-05', $4, $5, now())`,
        [s.grupo, `cus_${s.marca}`, `sub_${s.marca}`, `pay_${s.marca}`, s.conta],
      );
    },
  ],
];

async function criarConta(db: pg.Client, email: string, nome: string): Promise<string> {
  return umId(db, `INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ($1, $2, 'x', now()) RETURNING id`, [
    email,
    nome,
  ]);
}

async function criarGrupo(db: pg.Client, nome: string, slug: string, conta: string): Promise<string> {
  return umId(
    db,
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
     VALUES ($1, $2, 'sabado', 'semanal', '09:00', $3, now()) RETURNING id`,
    [nome, slug, conta],
  );
}

/**
 * Cria, como superusuário, duas contas com um grupo cada (conta A no grupo A, conta B no
 * grupo B), uma conta sem vínculo e uma linha por grupo em toda tabela com `grupo_id`.
 * Recusa, antes de gravar, se o catálogo tem tabela com `grupo_id` que o cenário não preenche.
 */
export async function criarCenario(db: pg.Client): Promise<Cenario> {
  const tabelas = await tabelasComGrupo(db);
  const conhecidas = new Set(['grupos', ...PREENCHER.map(([t]) => t)]);
  const faltam = tabelas.filter((t) => !conhecidas.has(t.tabela)).map((t) => t.tabela);
  if (faltam.length > 0) {
    throw new Error(`Cenário sem linha para tabela com grupo_id: ${faltam.join(', ')}`);
  }

  const contaA = await criarConta(db, 'conta-a@exemplo.test', 'Conta A');
  const contaB = await criarConta(db, 'conta-b@exemplo.test', 'Conta B');
  const contaSemVinculo = await criarConta(db, 'sem-vinculo@exemplo.test', 'Sem Vínculo');
  const slugA = 'grupo-a';
  const slugB = 'grupo-b';
  const grupoA = await criarGrupo(db, 'Grupo A', slugA, contaA);
  const grupoB = await criarGrupo(db, 'Grupo B', slugB, contaB);

  const sementes: Semente[] = [
    { grupo: grupoA, conta: contaA, marca: 'a', ids: {} },
    { grupo: grupoB, conta: contaB, marca: 'b', ids: {} },
  ];
  for (const semente of sementes) {
    for (const [, preencher] of PREENCHER) await preencher(db, semente);
  }

  return { contaA, contaB, contaSemVinculo, grupoA, grupoB, slugA, slugB, tabelas };
}

export interface Banco {
  url: string;
  nome: string;
}

/**
 * Banco de teste migrado com o cenário, entregue a `fn` com um cliente do superusuário.
 * O cliente fecha e o banco é removido no `finally`, mesmo quando `fn` lança erro.
 */
export async function comCenario<T>(fn: (db: pg.Client, cenario: Cenario, banco: Banco) => Promise<T>): Promise<T> {
  return bancoDeTeste(
    (url, nome) => comCliente(url, async (db) => fn(db, await criarCenario(db), { url, nome })),
    { migrado: true },
  );
}

export interface CenarioAberto extends Banco {
  db: pg.Client;
  cenario: Cenario;
  /** Fecha o cliente e remove o banco. */
  fechar(): Promise<void>;
}

/**
 * Versão de `comCenario` para `beforeAll`/`afterAll`: um banco migrado por arquivo de teste,
 * removido no `fechar()` (que roda o `finally` do `bancoDeTeste`).
 */
export async function abrirCenario(): Promise<CenarioAberto> {
  let liberar!: () => void;
  const fim = new Promise<void>((r) => {
    liberar = r;
  });
  let entregar!: (aberto: Omit<CenarioAberto, 'fechar'>) => void;
  const aberto = new Promise<Omit<CenarioAberto, 'fechar'>>((r) => {
    entregar = r;
  });
  const execucao = comCenario(async (db, cenario, banco) => {
    entregar({ db, cenario, ...banco });
    await fim;
  });
  const primeiro = await Promise.race([aberto, execucao.then(() => null)]);
  if (!primeiro) throw new Error('O cenário encerrou antes de abrir.');
  return {
    ...primeiro,
    fechar: async () => {
      liberar();
      await execucao;
    },
  };
}
