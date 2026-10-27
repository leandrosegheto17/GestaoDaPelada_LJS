import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.ts';
import { naoEncontrado } from '../erros.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Barra o acesso a grupo sem vínculo (ACE-41, G-03). Em `/api/grupos/:grupoId/*`, procura o grupo sob a RLS, já na
 * transação da rota com `app.conta_id` (a visibilidade vem de `grupos_visiveis()`): sem linha, 404, o mesmo de um
 * grupo que não existe. Vem depois do `exigirSessao`.
 */
export const exigirVinculo: MiddlewareHandler<AppEnv> = async (c, proximo) => {
  const grupoId = c.req.param('grupoId');
  if (!grupoId || !UUID.test(grupoId)) return naoEncontrado(c);
  const grupo = await c.var.db.selectFrom('grupos').select('id').where('id', '=', grupoId).executeTakeFirst();
  if (!grupo) return naoEncontrado(c);
  await proximo();
};
