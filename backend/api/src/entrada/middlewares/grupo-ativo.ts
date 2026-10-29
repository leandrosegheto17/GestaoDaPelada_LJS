import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.ts';
import { CODIGOS_ERRO, erroComStatus } from '../erros.ts';

const LEITURAS = new Set(['GET', 'HEAD']);

/**
 * Barra a escrita no grupo arquivado (GEL-26, design C6): em `/api/grupos/:grupoId/*`, todo método que não é GET nem
 * HEAD recebe 409 `grupo_arquivado` se o grupo está arquivado, também para a conta criadora. A única exceção é
 * `POST /api/grupos/:grupoId/reativar`. Vem depois do `exigirVinculo`: o grupo é visível (com a nova
 * `grupos_visiveis()`, o arquivado só é visível à criadora). Só lê `arquivado_em`, na transação da rota.
 */
export const exigirGrupoAtivo: MiddlewareHandler<AppEnv> = async (c, proximo) => {
  if (LEITURAS.has(c.req.method)) return proximo();
  const grupoId = c.req.param('grupoId');
  if (c.req.method === 'POST' && c.req.path === `/api/grupos/${grupoId}/reativar`) return proximo();
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
