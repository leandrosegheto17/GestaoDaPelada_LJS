import type pg from 'pg';
import { comoApp, type Contexto } from './apoio.ts';
import { MATRIZ, type CasoMatriz } from './matriz.ts';

/**
 * Casos de escrita da matriz (FUN-14, FUN-17), compartilhados pelos testes de escrita por
 * conta e do contexto público. A chave é a tabela da `MATRIZ`.
 */

export interface IdsDoGrupo {
  jogador: string;
  habilidade: string;
  partida: string;
}

export interface Escrita {
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

export const ESCRITA: Record<string, Escrita> = {
  // notificacoes T7 (AD-101): sem grant nenhum para pelada_app; a escrita só passa pelas funções.
  avisos_cobranca: {
    insere: false,
    altera: false,
    apaga: false,
    inserir: (g) => [
      `INSERT INTO avisos_cobranca (id_externo, tipo, grupo_id) VALUES ('pay_intruso', 'cobranca_gerada', $1)`,
      [g],
    ],
    alterar: 'enviado_em = now()',
  },
  push_ranking: {
    insere: false,
    altera: false,
    apaga: false,
    inserir: (g) => [
      `INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth)
       VALUES ($1, 'https://fcm.googleapis.com/fcm/send/intruso', 'p256dh-intruso', 'auth-intruso')`,
      [g],
    ],
    alterar: `auth = 'auth-trocada'`,
  },
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

export function escritaDe(caso: Pick<CasoMatriz, 'tabela'>): Escrita {
  const e = ESCRITA[caso.tabela];
  if (!e) throw new Error(`${caso.tabela}: sem caso de escrita`);
  return e;
}

export const ident = (db: pg.Client, nome: string): string => db.escapeIdentifier(nome);

/** Conteúdo do grupo em toda tabela da matriz, como texto JSON ordenado. Exige superusuário. */
export async function conteudo(db: pg.Client, grupo: string): Promise<Record<string, string>> {
  const r: Record<string, string> = {};
  for (const { tabela, coluna } of MATRIZ) {
    const s = await db.query<{ j: string }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)::text AS j
         FROM ${ident(db, tabela)} t WHERE t.${ident(db, coluna)} = $1`,
      [grupo],
    );
    r[tabela] = s.rows[0]?.j ?? '[]';
  }
  return r;
}

/** Ids de uma linha do grupo em jogadores, habilidades e partidas (para os INSERTs com chave estrangeira). */
export async function idsDoGrupo(db: pg.Client, grupo: string): Promise<IdsDoGrupo> {
  const primeiro = async (tabela: string): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `SELECT id FROM ${ident(db, tabela)} WHERE grupo_id = $1 LIMIT 1`,
      [grupo],
    );
    const id = r.rows[0]?.id;
    if (!id) throw new Error(`Cenário sem linha em ${tabela}`);
    return id;
  };
  return {
    jogador: await primeiro('jogadores'),
    habilidade: await primeiro('habilidades'),
    partida: await primeiro('partidas'),
  };
}

export interface Tentativa {
  linhas: number | null;
  erro: { code?: string; message: string } | null;
  /** Conteúdo do grupo observado, lido na mesma transação, depois da tentativa. */
  observado: Record<string, string>;
}

/**
 * Roda o comando como `pelada_app` com o contexto dado e lê o conteúdo do grupo observado
 * na mesma transação, depois de `RESET ROLE` (superusuário, sem RLS) e antes do ROLLBACK do
 * `comoApp`: ler depois do ROLLBACK esconderia uma escrita que vazou.
 */
export async function tentar(
  db: pg.Client,
  contexto: Contexto,
  grupoObservado: string,
  sql: string,
  valores: unknown[] = [],
): Promise<Tentativa> {
  return comoApp(db, contexto, async (d) => {
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
    return { linhas, erro, observado: await conteudo(d, grupoObservado) };
  });
}

export const RLS = /row-level security/;
export const SEM_GRANT = /permission denied/;
