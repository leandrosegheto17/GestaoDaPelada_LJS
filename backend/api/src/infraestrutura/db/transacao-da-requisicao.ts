import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import pg from 'pg';
import type { Banco } from './tipos.ts';

const OID_DATE = 1082;

/** `date` volta como texto `AAAA-MM-DD` (nunca como Date com fuso); o resto segue o padrão do pg. */
const tiposDoBanco = {
  getTypeParser: ((oid: number, formato?: 'text' | 'binary') =>
    oid === OID_DATE
      ? (valor: string) => valor
      : pg.types.getTypeParser(oid, formato as 'text')) as typeof pg.types.getTypeParser,
};

/** Tentativa de abrir, fechar ou aninhar transação dentro da transação da requisição. */
export class TransacaoAninhada extends Error {
  override readonly name = 'TransacaoAninhada';
  constructor() {
    super('A requisição já roda numa transação; abrir outra dentro dela é proibido.');
  }
}

/** Consulta depois que a transação da requisição terminou (ex.: tarefa solta no `waitUntil`). */
export class TransacaoEncerrada extends Error {
  override readonly name = 'TransacaoEncerrada';
  constructor() {
    super('A transação da requisição já terminou.');
  }
}

/** Contexto de RLS da requisição: quem é a conta e, nas rotas públicas, o slug do grupo. */
export interface ContextoRls {
  contaId?: string | null | undefined;
  slugPublico?: string | null | undefined;
}

export interface OpcoesTransacao {
  /** String de conexão do binding do Hyperdrive (origem: pelada_app). Lida só ao conectar. */
  connectionString: () => string;
  /** GET e HEAD: `BEGIN READ ONLY`. */
  somenteLeitura: boolean;
  /** Lido uma vez, na primeira consulta. */
  contexto: () => ContextoRls;
}

/** Banco da requisição: sempre dentro da transação aberta pelo `comBanco`. */
export type Db = Kysely<Banco>;

export interface TransacaoDaRequisicao {
  db: Db;
  /** A conexão chegou a ser pedida (houve ao menos uma consulta). */
  aberta(): boolean;
  /** `COMMIT` (confirmar) ou `ROLLBACK`. Depois disso, nenhuma consulta passa. */
  terminar(confirmar: boolean): Promise<void>;
  /** Fecha a conexão. Seguro chamar mais de uma vez. */
  fechar(): Promise<void>;
}

// Comandos de controle de transação. Comentários e espaços no começo não escondem o comando.
const CONTROLE = /^(begin|start|commit|end|rollback|abort|savepoint|release|prepare\s+transaction)\b/i;
const PREFIXO_IGNORADO = /^(\s+|--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/)/;

function semPrefixo(texto: string): string {
  let resto = texto;
  for (let m = PREFIXO_IGNORADO.exec(resto); m; m = PREFIXO_IGNORADO.exec(resto)) resto = resto.slice(m[0].length);
  return resto;
}

/**
 * Transação de UMA requisição (FUN-16). A conexão só abre na primeira consulta: `BEGIN` (`READ ONLY` em leitura) e
 * `set_config('app.conta_id', $1, true), set_config('app.slug_publico', $2, true)` com parâmetros, antes de qualquer
 * consulta da rota. Toda consulta vai pelo protocolo estendido (um comando por vez) e comandos de controle de
 * transação são recusados com `TransacaoAninhada`, assim como `db.transaction()` e `db.startTransaction()`.
 */
export function abrirTransacaoDaRequisicao(opcoes: OpcoesTransacao): TransacaoDaRequisicao {
  let cliente: pg.Client | null = null;
  let inicio: Promise<pg.Client> | null = null;
  let encerrada = false;

  const iniciar = (): Promise<pg.Client> =>
    (inicio ??= (async () => {
      const novo = new pg.Client({ connectionString: opcoes.connectionString(), types: tiposDoBanco });
      // Ao fechar, o socket do Workers cancela a leitura pendente e o erro sobe até o cliente; sem ouvinte vira
      // rejeição não tratada.
      novo.on('error', () => undefined);
      cliente = novo;
      await novo.connect();
      await novo.query(opcoes.somenteLeitura ? 'BEGIN READ ONLY' : 'BEGIN');
      const { contaId, slugPublico } = opcoes.contexto();
      await novo.query("SELECT set_config('app.conta_id', $1, true), set_config('app.slug_publico', $2, true)", [
        contaId ?? '',
        slugPublico ?? '',
      ]);
      return novo;
    })());

  const conexao: DatabaseConnection = {
    async executeQuery<R>(consulta: CompiledQuery): Promise<QueryResult<R>> {
      if (encerrada) throw new TransacaoEncerrada();
      if (CONTROLE.test(semPrefixo(consulta.sql))) throw new TransacaoAninhada();
      const aberto = await iniciar();
      if (encerrada) throw new TransacaoEncerrada();
      // `queryMode` existe no pg 8.11+, mas não nos tipos do @types/pg: o protocolo estendido recusa vários comandos
      // numa consulta só (`SELECT 1; COMMIT`).
      const config: pg.QueryConfig & { queryMode: 'extended' } = {
        text: consulta.sql,
        values: [...consulta.parameters],
        queryMode: 'extended',
      };
      const { command, rowCount, rows } = await aberto.query(config);
      const linhas = rows as R[];
      const altera = ['INSERT', 'UPDATE', 'DELETE', 'MERGE'].includes(command);
      return altera ? { rows: linhas, numAffectedRows: BigInt(rowCount ?? 0) } : { rows: linhas };
    },
    // eslint-disable-next-line require-yield
    async *streamQuery() {
      throw new Error('streamQuery não é suportado na transação da requisição.');
    },
  };

  const recusar = async (): Promise<void> => {
    throw new TransacaoAninhada();
  };
  const driver: Driver = {
    init: async () => undefined,
    acquireConnection: async () => conexao,
    beginTransaction: recusar,
    commitTransaction: recusar,
    rollbackTransaction: recusar,
    savepoint: recusar,
    rollbackToSavepoint: recusar,
    releaseSavepoint: recusar,
    releaseConnection: async () => undefined,
    destroy: async () => undefined,
  };

  const db = new Kysely<Banco>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new PostgresIntrospector(k),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });

  return {
    db,
    aberta: () => inicio !== null,
    async terminar(confirmar) {
      if (encerrada) return;
      encerrada = true;
      if (!inicio) return;
      const aberto = await inicio;
      await aberto.query(confirmar ? 'COMMIT' : 'ROLLBACK');
    },
    async fechar() {
      encerrada = true;
      const atual = cliente;
      cliente = null;
      if (!atual) return;
      await inicio?.catch(() => undefined);
      await atual.end().catch(() => undefined);
    },
  };
}
