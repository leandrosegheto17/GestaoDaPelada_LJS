import type { Hono, MiddlewareHandler } from 'hono';
import { sql } from 'kysely';
import { corpoDoErro } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import type { OpcoesCliente } from '../../infraestrutura/db/cliente.ts';
import { comBanco } from './com-banco.ts';
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

/**
 * Cadeia das rotas de grupo em `criarApp`, antes delas: sessão (401), transação com a conta da
 * sessão e vínculo (404). As rotas de `/api/grupos/:grupoId/*` só declaram o handler.
 */
export function protegerRotasDeGrupo(api: Hono<Ambiente>, opcoes: OpcoesRotasDeGrupo = {}): void {
  api.use(ROTAS_DE_GRUPO, exigirSessao, comBanco(undefined, opcoes.fabrica ? { fabrica: opcoes.fabrica } : {}), exigirVinculo);
}
