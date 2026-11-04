import type { Context, MiddlewareHandler } from 'hono';
import type { Kysely } from 'kysely';
import type { Banco } from '../../infraestrutura/db/banco.ts';
import { criarClienteLazy } from '../../infraestrutura/db/cliente.ts';
import {
  abrirTransacaoDaRequisicao,
  type ContextoDoBanco,
} from '../../infraestrutura/db/transacao.ts';
import type { AppEnv } from '../app.ts';

export interface VariaveisDoBanco {
  db: Kysely<Banco>;
}

export interface OpcoesComBanco {
  /** Nome da sessão no `pg_stat_activity`. */
  applicationName?: string;
}

type Ambiente = AppEnv & { Variables: VariaveisDoBanco };

/**
 * Uma transação por requisição, com o contexto da RLS definido antes de qualquer consulta (FUN-16). `GET` e `HEAD`
 * abrem `READ ONLY`. Termina com `COMMIT` se o status for menor que 400, senão `ROLLBACK` (e a rota que lança também
 * cai em `ROLLBACK`). A conexão só abre na primeira consulta e fecha no `waitUntil`. Entrega `c.var.db`.
 */
export function comBanco(
  contexto: (c: Context<Ambiente>) => ContextoDoBanco,
  opcoes: OpcoesComBanco = {},
): MiddlewareHandler<Ambiente> {
  return async (c, next) => {
    const cliente = criarClienteLazy(
      () => c.env.HYPERDRIVE.connectionString,
      opcoes.applicationName ? { applicationName: opcoes.applicationName } : {},
    );
    const metodo = c.req.method;
    const transacao = abrirTransacaoDaRequisicao({
      cliente,
      somenteLeitura: metodo === 'GET' || metodo === 'HEAD',
      contexto: () => contexto(c),
    });
    c.set('db', transacao.db);

    try {
      await next();
      // Erro da rota: o Hono já trocou a resposta por 500 (`c.error`), que cai no ROLLBACK pelo status.
      await transacao.terminar(!c.error && c.res.status < 400);
    } catch (erro) {
      await transacao.terminar(false).catch(() => undefined);
      throw erro;
    } finally {
      const fechamento = cliente.fechar();
      try {
        c.executionCtx.waitUntil(fechamento);
      } catch {
        // sem ExecutionContext (fora do runtime do Worker), espera aqui mesmo
        await fechamento;
      }
    }
  };
}
