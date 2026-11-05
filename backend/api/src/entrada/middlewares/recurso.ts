import type { Hono, MiddlewareHandler } from 'hono';
import type { RecursoPro } from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';

/**
 * Trava de recurso do plano (T32 da simulador; SIM-68, AD-049, AD-062, AD-091). `recursoLiberado` é o ponto único da
 * regra de plano na API (PLA-07 da `planos-e-cobranca`, `.specs/features/planos-e-cobranca/spec.md:79`). Desde a T21
 * da planos-e-cobranca o padrão do `criarApp` é o `recursoLiberadoPeloPlano` (`aplicacao/plano/recurso-liberado.ts`),
 * que lê a situação comercial na transação da requisição e decide pelo domínio; antes, liberava todo grupo.
 *
 * O `criarApp({ recursoLiberado })` aceita outra função nos testes (como o relógio); a rota lê a da requisição em
 * `c.var.recursoLiberado`.
 *
 * Ordem na cadeia de `/api/grupos/:grupoId/*` (AD-077): `exigirVinculo` (404), `exigirGrupoAtivo` (409) e depois esta
 * trava (403 `plano_pro`), antes da rota. Corpo do 403 na forma da AD-091: `{ erro: 'plano_pro', recurso, mensagem }`.
 */

/** Recursos do plano Pro (tabela do domínio, PLA-05). O `financeiro` trava só as escritas (AD-074, financeiro T24). */
export type { RecursoPro };

export type { RecursoLiberado } from '../../aplicacao/plano/recurso-liberado.ts';
export { recursoLiberadoPeloPlano } from '../../aplicacao/plano/recurso-liberado.ts';

export const MENSAGEM_PLANO_PRO = 'Este recurso é do plano Pro.';

/** 403 `plano_pro` quando o recurso não está liberado para o grupo; senão segue para a rota. */
export function exigirRecurso(recurso: RecursoPro): MiddlewareHandler<Ambiente> {
  return async (c, next) => {
    const grupoId = c.req.param('grupoId') ?? '';
    const liberado = await c.var.recursoLiberado(c.var.db, grupoId, recurso);
    if (!liberado) return c.json({ erro: 'plano_pro', recurso, mensagem: MENSAGEM_PLANO_PRO }, 403);
    await next();
  };
}

/**
 * A mesma trava, só nas escritas (financeiro T24; FIN-45, FIN-50; AD-074): GET e HEAD passam sem consultar o ponto
 * único, e o grupo em "somente leitura" continua lendo o caixa. Nas outras, recurso negado responde 403 `plano_pro`
 * com o recurso, antes da rota e sem gravar nada.
 */
export function exigirRecursoNaEscrita(recurso: RecursoPro): MiddlewareHandler<Ambiente> {
  const travar = exigirRecurso(recurso);
  return async (c, next) => {
    const metodo = c.req.method.toUpperCase();
    if (metodo === 'GET' || metodo === 'HEAD') {
      await next();
      return;
    }
    return travar(c, next);
  };
}

/**
 * Caminhos que passam pela trava do simulador (SIM-68): todas as rotas do simulador e a de escalação. O meta-teste
 * confere que toda rota registrada sob esses caminhos responde 403 com o recurso negado.
 */
export const CAMINHOS_DO_SIMULADOR = ['/grupos/:grupoId/simulador/*', '/grupos/:grupoId/escalacoes'] as const;

/** Liga a trava do simulador nos caminhos dele; chamado pelo `criarApp` depois da cadeia das rotas de grupo. */
export function travarRecursosDoPlano(api: Hono<Ambiente>): void {
  for (const caminho of CAMINHOS_DO_SIMULADOR) api.use(caminho, exigirRecurso('simulador'));
}
