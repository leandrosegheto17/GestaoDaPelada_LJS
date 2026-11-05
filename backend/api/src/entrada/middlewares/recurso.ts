import type { Hono, MiddlewareHandler } from 'hono';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';
import type { Ambiente } from '../ambiente.ts';

/**
 * Trava de recurso do plano (T32 da simulador; SIM-68, AD-049, AD-062, AD-091). `recursoLiberado` é o ponto único da
 * regra de plano na API (PLA-07 da `planos-e-cobranca`, `.specs/features/planos-e-cobranca/spec.md:79`): nesta feature
 * libera todo grupo, sem ler a situação comercial; a feature 7 troca só esta função. Recebe também o `Db` da transação
 * da requisição, porque a versão da feature 7 lê a situação no banco.
 *
 * O `criarApp({ recursoLiberado })` aceita outra função nos testes (como o relógio); a rota lê a da requisição em
 * `c.var.recursoLiberado`.
 *
 * Ordem na cadeia de `/api/grupos/:grupoId/*` (AD-077): `exigirVinculo` (404), `exigirGrupoAtivo` (409) e depois esta
 * trava (403 `plano_pro`), antes da rota. Corpo do 403 na forma da AD-091: `{ erro: 'plano_pro', recurso, mensagem }`.
 */

/** Recursos do plano Pro que já têm trava na API. A `financeiro` acrescenta o dela (AD-074). */
export type RecursoPro = 'simulador';

export type RecursoLiberado = (db: Db, grupoId: string, recurso: RecursoPro) => Promise<boolean>;

/** Antes da `planos-e-cobranca`: todo grupo tem todo recurso (AD-049). */
export const recursoLiberadoPadrao: RecursoLiberado = async () => true;

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
 * Caminhos que passam pela trava do simulador (SIM-68): todas as rotas do simulador e a de escalação. O meta-teste
 * confere que toda rota registrada sob esses caminhos responde 403 com o recurso negado.
 */
export const CAMINHOS_DO_SIMULADOR = ['/grupos/:grupoId/simulador/*', '/grupos/:grupoId/escalacoes'] as const;

/** Liga a trava do simulador nos caminhos dele; chamado pelo `criarApp` depois da cadeia das rotas de grupo. */
export function travarRecursosDoPlano(api: Hono<Ambiente>): void {
  for (const caminho of CAMINHOS_DO_SIMULADOR) api.use(caminho, exigirRecurso('simulador'));
}
