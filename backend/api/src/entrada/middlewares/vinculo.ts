import type { Context, Hono, MiddlewareHandler, Next } from 'hono';
import { sql } from 'kysely';
import { corpoDoErro } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import type { OpcoesCliente } from '../../infraestrutura/db/cliente.ts';
import { comBanco } from './com-banco.ts';
import { exigirGrupoAtivo } from './grupo-ativo.ts';
import { exigirSessao } from './sessao.ts';

/**
 * Vínculo com o grupo nas rotas `/api/grupos/:grupoId/*` (T21; ACE-41). A RLS decide: o
 * `SELECT id FROM grupos WHERE id = $1` roda na transação da rota, com o `app.conta_id` da
 * sessão, e só devolve linha se o grupo está em `grupos_visiveis()` (vínculo da conta; grupo
 * arquivado só para a criadora, `1792844280000_grupos-visiveis-arquivado.sql:9`). Sem linha,
 * 404 igual a "não existe": quem não tem vínculo não descobre que o grupo existe.
 *
 * `grupoId` que não é uuid responde o mesmo 404 sem consultar (o banco recusaria o cast com
 * erro, que viraria 500).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const exigirVinculo: MiddlewareHandler<Ambiente> = async (c, next) => {
  const grupoId = c.req.param('grupoId') ?? '';
  if (!UUID.test(grupoId)) return c.json(corpoDoErro('nao_encontrado'), 404);
  const r = await sql<{ id: string }>`SELECT id FROM grupos WHERE id = ${grupoId}`.execute(c.var.db);
  if (r.rows.length === 0) return c.json(corpoDoErro('nao_encontrado'), 404);
  await next();
};

/** Caminho das rotas de grupo, relativo a /api. */
export const ROTAS_DE_GRUPO = '/grupos/:grupoId/*';

export interface OpcoesRotasDeGrupo {
  /** Só para os testes: fábrica de conexões do `comBanco` (ex.: como `pelada_app`). */
  fabrica?: NonNullable<OpcoesCliente['fabrica']>;
}

/** Caminho do próprio grupo (`GET` e `PATCH /api/grupos/:grupoId`, T29), relativo a /api. */
export const ROTA_DO_GRUPO = '/grupos/:grupoId';

/** Roda os middlewares em sequência, como o Hono: quem responde sem chamar `next` encerra a cadeia. */
function encadear(passos: ReadonlyArray<MiddlewareHandler<Ambiente>>): MiddlewareHandler<Ambiente> {
  return async (c: Context<Ambiente>, next: Next) => {
    const passo = async (i: number): Promise<Response | void> => {
      const atual = passos[i];
      if (!atual) {
        await next();
        return;
      }
      return atual(c, async () => {
        const r = await passo(i + 1);
        if (r instanceof Response) c.res = r;
      });
    };
    return passo(0);
  };
}

/**
 * Cadeia das rotas de grupo em `criarApp`, antes delas: sessão (401), transação com a conta da
 * sessão, vínculo (404) e grupo ativo nas escritas (409 `grupo_arquivado`, T22). As rotas de
 * `/api/grupos/:grupoId` e `/api/grupos/:grupoId/*` só declaram o handler.
 *
 * A cadeia é registrada nos dois caminhos e roda uma vez por requisição: se o roteador casar os
 * dois padrões no mesmo caminho, a segunda passagem só segue (uma transação só, T22).
 */
export function protegerRotasDeGrupo(api: Hono<Ambiente>, opcoes: OpcoesRotasDeGrupo = {}): void {
  const cadeia = encadear([
    exigirSessao,
    comBanco(undefined, opcoes.fabrica ? { fabrica: opcoes.fabrica } : {}),
    exigirVinculo,
    exigirGrupoAtivo,
  ]);
  const umaVez: MiddlewareHandler<Ambiente> = async (c, next) => {
    if (c.var.grupoProtegido) {
      await next();
      return;
    }
    c.set('grupoProtegido', true);
    return cadeia(c, next);
  };
  api.use(ROTA_DO_GRUPO, umaVez);
  api.use(ROTAS_DE_GRUPO, umaVez);
}
