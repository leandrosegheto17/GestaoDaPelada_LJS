import type { MiddlewareHandler } from 'hono';
import { sql } from 'kysely';
import { corpoDoErro } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { transacaoSomenteLeitura } from './com-banco.ts';

/**
 * Grupo ativo nas escritas de `/api/grupos/:grupoId` e `/api/grupos/:grupoId/*` (T22; GEL-26, SEC-004, SEC-007),
 * depois do `exigirVinculo` na mesma cadeia (`protegerRotasDeGrupo`), então vale também para as rotas de admins da
 * conta e acesso.
 *
 * Casos limite e estados (listados antes do código):
 * - GET e HEAD, arquivado ou não: passam sem consultar (a transação é `READ ONLY`; ler o grupo arquivado é da
 *   criadora, que o vínculo já filtrou, GEL-25);
 * - escrita em grupo ativo: passa, com a linha do grupo travada em `FOR KEY SHARE` até o fim da transação, para o
 *   arquivamento concorrente esperar a escrita em curso (SEC-007; `FOR SHARE` dava deadlock entre dois PATCH, que
 *   também pegam `FOR UPDATE` na mesma linha, `GSEG:163`);
 * - PATCH do grupo, convite, remoção de admin e qualquer outra escrita em grupo arquivado: 409 `grupo_arquivado`,
 *   também para a criadora (GEL-26), sem chamar a rota;
 * - `POST …/reativar` em arquivado: passa (é a saída do estado);
 * - `POST …/arquivar` em arquivado: passa, e a rota responde 200 sem mudança (GEL-29; nota de `GS:145`);
 * - `DELETE …/admins/convites/:id` em arquivado: passa, para a criadora cancelar o convite pendente (SEC-004);
 * - linha não lida (o vínculo passou, então não acontece fora de corrida): segue, e a rota responde o seu 404.
 *
 * A comparação do caminho é sobre `c.req.path` inteiro (`/api/grupos/<id>/...`), sem barra final.
 */

const EXCECOES: ReadonlyArray<{ metodo: string; caminho: RegExp }> = [
  { metodo: 'POST', caminho: /^\/api\/grupos\/[^/]+\/reativar$/ },
  { metodo: 'POST', caminho: /^\/api\/grupos\/[^/]+\/arquivar$/ },
  { metodo: 'DELETE', caminho: /^\/api\/grupos\/[^/]+\/admins\/convites\/[^/]+$/ },
];

/** A escrita passa mesmo com o grupo arquivado. */
export function passaComGrupoArquivado(metodo: string, caminho: string): boolean {
  const m = metodo.toUpperCase();
  return EXCECOES.some((e) => e.metodo === m && e.caminho.test(caminho));
}

/** A leitura de `arquivado_em` da escrita, com a trava que o arquivamento respeita (SEC-007). */
export const SQL_GRUPO_ATIVO =
  'SELECT arquivado_em IS NOT NULL AS arquivado FROM grupos WHERE id = $1 FOR KEY SHARE';

/**
 * Prévia (partidas-e-ranking T36; PAR-112, `BD:35`): a transação é `READ ONLY` (`transacaoSomenteLeitura`), onde o
 * Postgres recusa `FOR KEY SHARE`; a leitura é simples e o arquivado continua dando 409. Sem trava: a prévia não
 * grava, então não há escrita em curso para o arquivamento concorrente esperar.
 */
export const exigirGrupoAtivo: MiddlewareHandler<Ambiente> = async (c, next) => {
  const metodo = c.req.method.toUpperCase();
  if (metodo === 'GET' || metodo === 'HEAD') {
    await next();
    return;
  }
  const grupoId = c.req.param('grupoId') ?? '';
  const r = transacaoSomenteLeitura(metodo, c.req.path)
    ? await sql<{
        arquivado: boolean;
      }>`SELECT arquivado_em IS NOT NULL AS arquivado FROM grupos WHERE id = ${grupoId}`.execute(
        c.var.db,
      )
    : await sql<{
        arquivado: boolean;
      }>`SELECT arquivado_em IS NOT NULL AS arquivado FROM grupos WHERE id = ${grupoId} FOR KEY SHARE`.execute(
        c.var.db,
      );
  if (r.rows[0]?.arquivado === true && !passaComGrupoArquivado(metodo, c.req.path)) {
    return c.json(corpoDoErro('grupo_arquivado'), 409);
  }
  await next();
};
