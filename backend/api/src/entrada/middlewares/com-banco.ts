import type { MiddlewareHandler } from 'hono';
import { abrirTransacaoDaRequisicao } from '../../infraestrutura/db/index.ts';
import type { AppEnv } from '../app.ts';

const LEITURAS = new Set(['GET', 'HEAD']);

/**
 * Transação por requisição com o contexto de RLS (FUN-16). Disponibiliza `c.var.db`, que só conecta na primeira
 * consulta: `BEGIN` (`READ ONLY` em GET e HEAD) e `set_config(..., true)` com `contaId` e `slugPublico` lidos do
 * contexto naquele momento. Ao fim, `COMMIT` se a resposta for menor que 400 e `ROLLBACK` caso contrário (ou se a
 * rota lançar); a conexão fecha no `waitUntil`, depois da resposta. O `COMMIT` acontece antes de responder: se
 * falhar, a resposta vira 500.
 */
export const comBanco: MiddlewareHandler<AppEnv> = async (c, proximo) => {
  const transacao = abrirTransacaoDaRequisicao({
    connectionString: () => c.env.HYPERDRIVE.connectionString,
    somenteLeitura: LEITURAS.has(c.req.method),
    contexto: () => ({ contaId: c.get('contaId'), slugPublico: c.get('slugPublico') }),
  });
  c.set('db', transacao.db);
  try {
    await proximo();
    await transacao.terminar(c.res.status < 400 && !c.error);
  } catch (erro) {
    await transacao.terminar(false).catch(() => undefined);
    throw erro;
  } finally {
    if (transacao.aberta()) c.executionCtx.waitUntil(transacao.fechar());
  }
};
