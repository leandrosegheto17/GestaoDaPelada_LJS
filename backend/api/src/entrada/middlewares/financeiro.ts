import type { Hono, MiddlewareHandler } from 'hono';
import { sql } from 'kysely';
import { MENSAGENS_ERRO_FINANCEIRO } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { exigirRecursoNaEscrita } from './recurso.ts';

/**
 * Permissão do financeiro (financeiro T23; FIN-33; AD-077). Ordem na cadeia de `/api/grupos/:grupoId/*`:
 * `exigirVinculo` (404) → `exigirGrupoAtivo` (409, só nas escritas) → `exigirFinanceiro` (403
 * `sem_permissao_financeiro`) → trava de plano nas escritas (403 `plano_pro`, T24) → rota. As duas primeiras já rodam
 * pela `protegerRotasDeGrupo`; esta é ligada só nos caminhos do financeiro por `travarFinanceiro`, chamada pelo
 * `criarApp` depois dela.
 *
 * Lê o acesso na transação da requisição, pela mesma função que a RLS usa (`app_acessa_financeiro`, T9): a resposta e o
 * banco nunca divergem. Com acesso, entrega `c.var.acessaFinanceiro = true` e segue.
 *
 * Casos limite: sem sessão (401 do `exigirSessao`, antes); sem vínculo (404, antes); grupo arquivado na escrita (409,
 * antes, também para quem não tem acesso, AD-077); leitura de arquivado pela criadora com acesso (passa); admin sem
 * acesso em GET e em escrita (403).
 */

/** Corpo do 403, na forma de `CorpoErro` (`{ erro: mensagem, codigo }`). */
export function corpoSemPermissaoFinanceiro() {
  return {
    erro: MENSAGENS_ERRO_FINANCEIRO.sem_permissao_financeiro,
    codigo: 'sem_permissao_financeiro' as const,
  };
}

export const exigirFinanceiro: MiddlewareHandler<Ambiente> = async (c, next) => {
  const grupoId = c.req.param('grupoId') ?? '';
  const r = await sql<{
    ok: boolean;
  }>`SELECT app_acessa_financeiro(${grupoId}::uuid) AS ok`.execute(c.var.db);
  if (r.rows[0]?.ok !== true) return c.json(corpoSemPermissaoFinanceiro(), 403);
  c.set('acessaFinanceiro', true);
  await next();
};

/** Caminhos do financeiro, relativos a /api: as rotas do caixa e a de conceder ou retirar o acesso (FIN-35). */
export const CAMINHOS_DO_FINANCEIRO = [
  '/grupos/:grupoId/financeiro/*',
  '/grupos/:grupoId/admins/:contaId/financeiro',
] as const;

/**
 * Liga `exigirFinanceiro` e, depois dele, a trava de plano nas escritas (`exigirRecursoNaEscrita('financeiro')`, T24)
 * nos caminhos do financeiro; chamado pelo `criarApp` depois da cadeia das rotas de grupo.
 */
export function travarFinanceiro(api: Hono<Ambiente>): void {
  for (const caminho of CAMINHOS_DO_FINANCEIRO) {
    api.use(caminho, exigirFinanceiro, exigirRecursoNaEscrita('financeiro'));
  }
}
