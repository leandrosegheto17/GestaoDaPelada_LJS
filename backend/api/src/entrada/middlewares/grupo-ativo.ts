import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.ts';
import { CODIGOS_ERRO, erroComStatus } from '../erros.ts';

const LEITURAS = new Set(['GET', 'HEAD']);
/**
 * Escritas que passam mesmo no grupo arquivado: reativar (GEL-26) e arquivar. SPEC_DEVIATION: a GEL-26 só excetua o
 * reativar, mas a GEL-29 manda arquivar um grupo arquivado responder 200 sem mudar nada; o usuário decidiu
 * (2026-10-29) que vale a GEL-29: a rota de arquivar é idempotente e não altera o grupo já arquivado.
 */
const ESCRITAS_NO_ARQUIVADO = new Set(['reativar', 'arquivar']);
/**
 * Cancelar convite pendente (`DELETE admins/convites/:id`) também passa no grupo arquivado (T76; SEC-004): a criadora
 * precisa revogar um convite enquanto o grupo está arquivado. Só um segmento depois de `convites/`; qualquer outro
 * formato cai na checagem (falha fechada).
 */
const CANCELAR_CONVITE = /^admins\/convites\/[^/]+$/;

/**
 * Barra a escrita no grupo arquivado (GEL-26, design C6): em `/api/grupos/:grupoId/*`, todo método que não é GET nem
 * HEAD recebe 409 `grupo_arquivado` se o grupo está arquivado, também para a conta criadora. As exceções são
 * `POST /api/grupos/:grupoId/reativar` e `POST /api/grupos/:grupoId/arquivar` (ver `ESCRITAS_NO_ARQUIVADO`) e
 * `DELETE /api/grupos/:grupoId/admins/convites/:id` (ver `CANCELAR_CONVITE`). Vem depois do `exigirVinculo`: o grupo é visível (com a nova
 * `grupos_visiveis()`, o arquivado só é visível à criadora). Só lê `arquivado_em`, na transação da rota.
 */
export const exigirGrupoAtivo: MiddlewareHandler<AppEnv> = async (c, proximo) => {
  if (LEITURAS.has(c.req.method)) return proximo();
  const grupoId = c.req.param('grupoId');
  const prefixo = `/api/grupos/${grupoId}/`;
  const acao = c.req.path.startsWith(prefixo) ? c.req.path.slice(prefixo.length) : '';
  if (c.req.method === 'POST' && ESCRITAS_NO_ARQUIVADO.has(acao)) return proximo();
  if (c.req.method === 'DELETE' && CANCELAR_CONVITE.test(acao)) return proximo();
  const grupo = await c.var.db
    .selectFrom('grupos')
    .select('arquivado_em')
    .where('id', '=', grupoId ?? '')
    .executeTakeFirst();
  if (grupo?.arquivado_em) {
    return erroComStatus(c, 409, CODIGOS_ERRO.grupoArquivado, 'Este grupo está arquivado. Reative-o para alterar.');
  }
  await proximo();
};
