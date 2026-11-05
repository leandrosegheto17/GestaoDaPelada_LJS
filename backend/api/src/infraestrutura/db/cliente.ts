import type { Context } from 'hono';
import pg from 'pg';

/**
 * Cliente `pg` de uma requisição (FUN-16): a conexão só abre na primeira consulta, pela
 * `HYPERDRIVE.connectionString`, e fecha depois da resposta, no `waitUntil`. Requisição que
 * não consulta o banco não abre conexão.
 */

export const MENSAGEM_BANCO_INDISPONIVEL =
  'Serviço temporariamente indisponível. Tente de novo em instantes.';

/**
 * Falha ao abrir a conexão. A mensagem é fixa: nunca leva a URL, o host nem o erro do driver,
 * que podem conter a senha. O `app.onError` a transforma em 503.
 */
export class ErroBancoIndisponivel extends Error {
  override name = 'ErroBancoIndisponivel';
  constructor() {
    super(MENSAGEM_BANCO_INDISPONIVEL);
  }
}

/** O que o cliente precisa do `pg.Client`; os testes trocam pela fábrica. */
export interface ConexaoPg {
  connect(): Promise<unknown>;
  query(sql: string, valores?: unknown[]): Promise<pg.QueryResult>;
  end(): Promise<void>;
}

export interface OpcoesCliente {
  /** Cria a conexão; padrão: `new pg.Client({ connectionString })`. */
  fabrica?: (connectionString: string) => ConexaoPg;
  /**
   * Roda logo depois de conectar, antes da primeira consulta pedida (ex.: `BEGIN` e o contexto
   * da RLS, no `comBanco`). Se falhar, a consulta falha e a conexão é fechada no `fechar()`.
   */
  aoAbrir?: (
    consultar: (sql: string, valores?: unknown[]) => Promise<pg.QueryResult>,
  ) => Promise<void>;
}

export interface ClienteRequisicao {
  /** Abre a conexão na primeira chamada e roda a consulta. */
  consultar<L extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    valores?: unknown[],
  ): Promise<pg.QueryResult<L>>;
  /** Verdadeiro quando a conexão abriu e o `aoAbrir` terminou. */
  aberto(): boolean;
  /** Fecha a conexão, se abriu. Nunca lança. Chamadas repetidas não fazem nada. */
  fechar(): Promise<void>;
}

const fabricaPadrao = (connectionString: string): ConexaoPg => new pg.Client({ connectionString });

export function criarCliente(
  connectionString: string,
  opcoes: OpcoesCliente = {},
): ClienteRequisicao {
  const fabrica = opcoes.fabrica ?? fabricaPadrao;
  let conexao: ConexaoPg | null = null;
  let abrindo: Promise<ConexaoPg> | null = null;
  let pronto = false;
  let fechado = false;

  async function abrir(): Promise<ConexaoPg> {
    if (fechado) throw new Error('Cliente da requisição já foi fechado.');
    const nova = fabrica(connectionString);
    conexao = nova;
    try {
      await nova.connect();
    } catch {
      // O erro do driver é descartado de propósito: pode trazer host, usuário ou senha.
      throw new ErroBancoIndisponivel();
    }
    if (opcoes.aoAbrir) await opcoes.aoAbrir((sql, valores) => nova.query(sql, valores));
    pronto = true;
    return nova;
  }

  return {
    async consultar<L extends pg.QueryResultRow>(
      sql: string,
      valores?: unknown[],
    ): Promise<pg.QueryResult<L>> {
      abrindo ??= abrir();
      const c = await abrindo;
      return (await c.query(sql, valores)) as pg.QueryResult<L>;
    },
    aberto: () => pronto,
    async fechar(): Promise<void> {
      if (fechado) return;
      fechado = true;
      // Espera uma abertura em andamento terminar (ou falhar) antes de fechar.
      await abrindo?.catch(() => undefined);
      await conexao?.end().catch(() => undefined);
    },
  };
}

/**
 * Agenda o fechamento do cliente para depois da resposta (`executionCtx.waitUntil`). Sem
 * contexto de execução (fora do Worker), fecha na hora.
 */
export async function fecharNoFim(c: Context, cliente: ClienteRequisicao): Promise<void> {
  const fechamento = cliente.fechar();
  let ctx: { waitUntil(p: Promise<unknown>): void } | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = undefined;
  }
  if (ctx) ctx.waitUntil(fechamento);
  else await fechamento;
}
