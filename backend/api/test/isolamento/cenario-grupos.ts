import type pg from 'pg';
import { comoApp, tabelasComGrupo, type Banco, type OpcoesComoApp } from './apoio.ts';
import {
  abrirCenarioConta,
  comCenarioConta,
  type CenarioConta,
  type CenarioContaAberto,
} from './cenario-conta.ts';

/**
 * Cenário de grupos e elenco (grupos-e-elenco T0; GEL-112). Estende o cenário de conta (CA T0):
 * - C é a conta A do cenário de conta, criadora do grupo G, que nasce pela própria `grupo_criar`
 *   (como `pelada_app`, com `app.conta_id` = C), com as 6 habilidades iniciais;
 * - O é uma conta nova, admin de G só por vínculo (não criou G);
 * - H é o grupo B do cenário da fundação, só da conta B;
 * - G ganha, como superusuário, um jogador ativo (período aberto), um inativo (período encerrado) e um com
 *   histórico (presença numa partida, nota e pagamento mensal), mais uma linha em toda tabela com `grupo_id`.
 * Os helpers `arquivar` e `reativar` mudam `arquivado_em` como superusuário (a trigger da criadora vale só para
 * `pelada_app`, `1792844520000_grupos-arquivar-so-criadora.sql:13`).
 */

export const EMAIL_O = 'outra-admin@exemplo.test';
export const NOME_G = 'Pelada de Quinta';
export const SLUG_G = 'pelada-de-quinta';

/** As habilidades iniciais, na ordem do GEL-02. */
export const HABILIDADES_INICIAIS = [
  'Visão de Jogo',
  'Passe',
  'Preparo Físico',
  'Drible',
  'Chute',
  'Desarme',
] as const;

export interface IdsG {
  /** Jogador com período aberto desde 2026-01-01. */
  jogadorAtivo: string;
  /** Jogador com um período encerrado (2025-03-01 a 2025-12-31). */
  jogadorInativo: string;
  /** Jogador ativo com presença, nota e pagamento: não pode ser excluído (GEL-85). */
  jogadorHistorico: string;
  /** A primeira habilidade criada pela `grupo_criar` (Visão de Jogo). */
  habilidade: string;
  partida: string;
  lancamento: string;
}

export interface CenarioGrupos extends CenarioConta {
  /** A criadora de G (= contaA). */
  contaC: string;
  /** A outra admin de G, só por vínculo. */
  contaO: string;
  emailO: string;
  grupoG: string;
  slugG: string;
  /** O grupo só da conta B (= grupoB). */
  grupoH: string;
  idsG: IdsG;
}

export interface OpcoesCenarioGrupos {
  /** Nome de G; um nome com menos de 3 caracteres faz a `grupo_criar` falhar (teste de limpeza). */
  nomeG?: string;
}

async function umId(db: pg.Client, sql: string, valores: unknown[]): Promise<string> {
  const r = await db.query<{ id: string }>(sql, valores);
  const id = r.rows[0]?.id;
  if (!id) throw new Error(`Inserção sem id: ${sql}`);
  return id;
}

/** Tabelas com `grupo_id` que o cenário preenche em G (as demais, a `grupo_criar` preenche). */
const PREENCHIDAS_EM_G = new Set([
  'vinculos_admin',
  'jogadores',
  'periodos_ativos',
  'habilidades',
  'notas',
  'config_pesos',
  'partidas',
  'presencas',
  'eventos_uso',
  'escalacoes',
  'config_financeira',
  'lancamentos',
  'pagamentos_mes',
  'auditoria',
  'convites_admin',
  'assinaturas',
  'push_ranking',
  'avisos_cobranca',
]);

/** Cria G pela `grupo_criar`, como `pelada_app` com a conta C, e devolve id e slug. */
export async function criarGrupoComoConta(
  db: pg.Client,
  conta: string,
  nome: string,
  slugBase: string,
  habilidades: readonly string[] = HABILIDADES_INICIAIS,
): Promise<{ id: string; slug: string }> {
  return comoApp(
    db,
    { conta },
    async (d) => {
      const r = await d.query<{ id: string; slug: string }>(
        // De 7 parâmetros desde a T25 do simulador (AD-037), com a data que a de 6 usava.
        `SELECT id, slug FROM grupo_criar($1, 'quinta', 'semanal', '20:00', $2, $3::text[],
           (now() AT TIME ZONE 'America/Sao_Paulo')::date)`,
        [nome, slugBase, habilidades],
      );
      const linha = r.rows[0];
      if (!linha) throw new Error('grupo_criar sem linha');
      return linha;
    },
    { confirmar: true },
  );
}

async function jogador(
  db: pg.Client,
  grupo: string,
  apelido: string,
  conta: string,
): Promise<string> {
  return umId(
    db,
    `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 'meia', $3, now(), $3, now()) RETURNING id`,
    [grupo, apelido, conta],
  );
}

/** Completa o cenário de conta com G, O, o elenco de G e uma linha de G em toda tabela com `grupo_id`. */
export async function completarCenarioGrupos(
  db: pg.Client,
  base: CenarioConta,
  opcoes: OpcoesCenarioGrupos = {},
): Promise<CenarioGrupos> {
  const faltam = base.tabelas
    .filter((t) => t.tabela !== 'grupos' && !PREENCHIDAS_EM_G.has(t.tabela))
    .map((t) => t.tabela);
  if (faltam.length > 0)
    throw new Error(`Cenário de grupos sem linha para tabela com grupo_id: ${faltam.join(', ')}`);

  const contaC = base.contaA;
  const contaO = await umId(
    db,
    `INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ($1, 'Outra Admin', 'x', now()) RETURNING id`,
    [EMAIL_O],
  );
  const g = await criarGrupoComoConta(db, contaC, opcoes.nomeG ?? NOME_G, SLUG_G);
  const grupoG = g.id;

  await db.query(
    `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em) VALUES ($1, $2, false, $3, now())`,
    [contaO, grupoG, contaC],
  );

  const jogadorAtivo = await jogador(db, grupoG, 'Toninho', contaC);
  const jogadorInativo = await jogador(db, grupoG, 'Zé Inativo', contaC);
  const jogadorHistorico = await jogador(db, grupoG, 'Bira', contaC);
  await db.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES
       ($1, $4, '2026-01-01', NULL), ($2, $4, '2025-03-01', '2025-12-31'), ($3, $4, '2026-01-01', NULL)`,
    [jogadorAtivo, jogadorInativo, jogadorHistorico, grupoG],
  );

  const habilidade = await umId(
    db,
    `SELECT id FROM habilidades WHERE grupo_id = $1 ORDER BY ordem LIMIT 1`,
    [grupoG],
  );
  await db.query(
    `INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor) VALUES ($1, $2, $3, 7)`,
    [jogadorHistorico, habilidade, grupoG],
  );
  await db.query(
    `INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva,
       lesionado_sem_chuva, lesionado_com_chuva, expulso, registrado_por, registrado_em)
     VALUES ($1, '2026-01-01', 3, 4, 1, 2, -1, $2, now())`,
    [grupoG, contaC],
  );
  const partida = await umId(
    db,
    `INSERT INTO partidas (grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
     VALUES ($1, '2026-01-08', $2, now(), $2, now()) RETURNING id`,
    [grupoG, contaC],
  );
  await db.query(
    `INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`,
    [partida, jogadorHistorico, grupoG],
  );
  await db.query(
    `INSERT INTO eventos_uso (grupo_id, tipo, momento, data_partida) VALUES ($1, 'partida_lancada', now(), '2026-01-08')`,
    [grupoG],
  );
  await db.query(
    `INSERT INTO escalacoes (grupo_id, data, formato, n, composicao, confirmada_por, confirmada_em)
     VALUES ($1, '2026-01-08', 'dois_times', 5, '{}'::jsonb, $2, now())`,
    [grupoG, contaC],
  );
  await db.query(
    `INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial)
     VALUES ($1, 5000, 0, '2026-01-01')`,
    [grupoG],
  );
  const lancamento = await umId(
    db,
    `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'entrada', '2026-01-05', 'Mensalidade', 5000, $2, now(), $2, now()) RETURNING id`,
    [grupoG, contaC],
  );
  await db.query(
    `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
     VALUES ($1, $2, '2026-01', $3, $4, now())`,
    [grupoG, jogadorHistorico, lancamento, contaC],
  );
  await db.query(
    `INSERT INTO convites_admin (grupo_id, email, token_hash, criado_por, criado_em, expira_em)
     VALUES ($1, 'convidado-g@exemplo.test', gen_random_bytes(32), $2, now(), now() + interval '1 day')`,
    [grupoG, contaC],
  );
  // planos-e-cobranca T10: uma assinatura cancelada de G (não ocupa o índice de vigente; G segue `uso_proprio`).
  await db.query(
    `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, pago_ate,
       cobranca_pro_id, criada_por, criada_em)
     VALUES ($1, 'cus_g', 'sub_g', 990, 'cancelada', '2026-01-05', 'pay_g', $2, now())`,
    [grupoG, contaC],
  );
  // notificacoes T7: uma assinatura de push do ranking e um aviso de cobrança de G.
  await db.query(
    `INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth)
     VALUES ($1, 'https://fcm.googleapis.com/fcm/send/semente-g', 'p256dh-g', 'auth-g')`,
    [grupoG],
  );
  await db.query(
    `INSERT INTO avisos_cobranca (id_externo, tipo, grupo_id) VALUES ('pay_aviso_g', 'cobranca_gerada', $1)`,
    [grupoG],
  );

  return {
    ...base,
    contaC,
    contaO,
    emailO: EMAIL_O,
    grupoG,
    slugG: g.slug,
    grupoH: base.grupoB,
    idsG: { jogadorAtivo, jogadorInativo, jogadorHistorico, habilidade, partida, lancamento },
  };
}

/** `comCenarioConta` com o cenário de grupos: o banco é removido no `finally`, também quando a criação falha. */
export async function comCenarioGrupos<T>(
  fn: (db: pg.Client, cenario: CenarioGrupos, banco: Banco) => Promise<T>,
  opcoes: OpcoesCenarioGrupos = {},
): Promise<T> {
  return comCenarioConta(async (db, base, banco) =>
    fn(db, await completarCenarioGrupos(db, base, opcoes), banco),
  );
}

export interface CenarioGruposAberto extends Omit<CenarioContaAberto, 'cenario'> {
  cenario: CenarioGrupos;
}

/** `abrirCenarioConta` com o cenário de grupos, para `beforeAll`/`afterAll`. Falha na criação fecha o banco. */
export async function abrirCenarioGrupos(
  opcoes: OpcoesCenarioGrupos = {},
): Promise<CenarioGruposAberto> {
  const aberto = await abrirCenarioConta();
  try {
    const cenario = await completarCenarioGrupos(aberto.db, aberto.cenario, opcoes);
    return { ...aberto, cenario };
  } catch (erro) {
    await aberto.fechar();
    throw erro;
  }
}

/** Arquiva o grupo como superusuário (o momento é `now()`). */
export async function arquivar(db: pg.Client, grupo: string): Promise<void> {
  await db.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [grupo]);
}

/** Reativa o grupo como superusuário. */
export async function reativar(db: pg.Client, grupo: string): Promise<void> {
  await db.query('UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [grupo]);
}

/** Roda `fn` como `pelada_app` em nome da conta (sem slug). Padrão: ROLLBACK ao fim. */
export async function comoConta<T>(
  db: pg.Client,
  conta: string,
  fn: (db: pg.Client) => Promise<T>,
  opcoes: OpcoesComoApp = {},
): Promise<T> {
  return comoApp(db, { conta }, fn, opcoes);
}

/** Roda `fn` como superusuário (o `postgres` do cluster local), numa transação desfeita ao fim. */
export async function comoSuperusuario<T>(
  db: pg.Client,
  fn: (db: pg.Client) => Promise<T>,
): Promise<T> {
  await db.query('BEGIN');
  try {
    return await fn(db);
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
  }
}

/** Ids dos grupos que a conta enxerga como `pelada_app`, ordenados. */
export async function gruposVistos(db: pg.Client, conta: string): Promise<string[]> {
  return comoConta(db, conta, async (d) => {
    const r = await d.query<{ id: string }>('SELECT id FROM grupos ORDER BY id');
    return r.rows.map((l) => l.id);
  });
}

export { tabelasComGrupo };
