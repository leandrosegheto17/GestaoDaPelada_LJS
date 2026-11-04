import { Kysely, PostgresDialect } from 'kysely';
import type { PostgresPool, PostgresPoolClient } from 'kysely';
import type { Banco } from './banco.ts';
import type { ClienteLazy } from './cliente.ts';

/** A rota tentou controlar a transação (BEGIN, COMMIT, ROLLBACK, SAVEPOINT, `db.transaction()`). */
export class TransacaoAninhada extends Error {
  constructor() {
    super('A transação da requisição é do middleware: a rota não pode controlá-la.');
    this.name = 'TransacaoAninhada';
  }
}

/** A rota usou o `db` depois que a requisição terminou. */
export class TransacaoEncerrada extends Error {
  constructor() {
    super('A transação desta requisição já terminou.');
    this.name = 'TransacaoEncerrada';
  }
}

export interface ContextoDoBanco {
  contaId?: string | undefined;
  slugPublico?: string | undefined;
}

export interface OpcoesTransacao {
  cliente: ClienteLazy;
  somenteLeitura: boolean;
  contexto: () => ContextoDoBanco;
}

export interface TransacaoDaRequisicao {
  db: Kysely<Banco>;
  /** `COMMIT` (confirmar) ou `ROLLBACK`. Depois disso, nenhuma consulta passa. Sem consulta antes, não faz nada. */
  terminar(confirmar: boolean): Promise<void>;
}

// Comentários e espaços antes do comando não o escondem.
const CONTROLE =
  /^(begin|start|commit|end|rollback|abort|savepoint|release|prepare\s+transaction)\b/i;
const PREFIXO_IGNORADO = /^(\s+|--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/)/;

function semPrefixo(texto: string): string {
  let resto = texto;
  for (let m = PREFIXO_IGNORADO.exec(resto); m; m = PREFIXO_IGNORADO.exec(resto)) {
    resto = resto.slice(m[0].length);
  }
  return resto;
}

/**
 * Transação de UMA requisição (FUN-16). A conexão só abre na primeira consulta: `BEGIN` (`READ ONLY` em leitura) e
 * `set_config('app.conta_id', $1, true), set_config('app.slug_publico', $2, true)` com parâmetros, antes de qualquer
 * consulta da rota. Comandos de controle de transação da rota são recusados.
 */
export function abrirTransacaoDaRequisicao(opcoes: OpcoesTransacao): TransacaoDaRequisicao {
  let preparacao: Promise<void> | null = null;
  let encerrada = false;

  const preparar = (): Promise<void> =>
    (preparacao ??= (async () => {
      const c = await opcoes.cliente.conectar();
      await c.query(opcoes.somenteLeitura ? 'BEGIN READ ONLY' : 'BEGIN');
      const { contaId, slugPublico } = opcoes.contexto();
      await c.query(
        "SELECT set_config('app.conta_id', $1, true), set_config('app.slug_publico', $2, true)",
        [contaId ?? '', slugPublico ?? ''],
      );
    })());

  // O Kysely pede uma conexão a este "pool" a cada consulta; a conexão é sempre a única da requisição.
  const pool: PostgresPool = {
    async connect(): Promise<PostgresPoolClient> {
      if (encerrada) throw new TransacaoEncerrada();
      await preparar();
      if (encerrada) throw new TransacaoEncerrada();
      const c = await opcoes.cliente.conectar();
      return {
        query: ((texto: unknown, valores?: unknown) => {
          const sqlTexto = typeof texto === 'string' ? texto : '';
          if (CONTROLE.test(semPrefixo(sqlTexto))) throw new TransacaoAninhada();
          return (c.query as (t: unknown, v?: unknown) => unknown)(texto, valores);
        }) as PostgresPoolClient['query'],
        release: () => undefined,
      };
    },
    end: async () => undefined,
    options: {},
  };

  const db = new Kysely<Banco>({ dialect: new PostgresDialect({ pool }) });

  return {
    db,
    async terminar(confirmar) {
      if (encerrada) return;
      encerrada = true;
      if (!preparacao) return;
      await preparacao;
      const c = await opcoes.cliente.conectar();
      await c.query(confirmar ? 'COMMIT' : 'ROLLBACK');
    },
  };
}
