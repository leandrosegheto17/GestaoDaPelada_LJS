import { Hono, type Context } from 'hono';
import { corpoDoErro, dataCorpo } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo, respostaDeCampo } from '../corpo.ts';
import { jogadores, type ResultadoPeriodo } from '../../infraestrutura/db/repositorios/jogadores.ts';

/**
 * `POST /api/grupos/:grupoId/jogadores/:id/inativar` e `…/reativar` (T42; GEL-51 a GEL-56), da tabela de `GD:174`.
 * A cadeia do grupo vem antes. Corpo `dataCorpo`: sem data, o repositório usa o hoje do relógio da requisição
 * (GEL-52, GEL-55). Respostas:
 * - 200 `{ alterado: true }`;
 * - 409 `ja_inativo` ("O jogador já está inativo.", GEL-53) ou `ja_ativo` ("O jogador já está ativo.", GEL-56);
 * - 422 da regra de período (GEL-58) no campo `data`, o único do corpo;
 * - 404 para jogador de fora do grupo ou id que não é uuid (GEL-44).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O resultado do repositório na resposta HTTP. */
export function respostaDePeriodo(c: Context<Ambiente>, r: ResultadoPeriodo, campoDoCorpo?: string): Response {
  if (r.resultado === 'nao_encontrado') return c.json(corpoDoErro('nao_encontrado'), 404);
  if (r.resultado === 'ja_inativo') return c.json(corpoDoErro('ja_inativo'), 409);
  if (r.resultado === 'ja_ativo') return c.json(corpoDoErro('ja_ativo'), 409);
  if (r.resultado === 'invalido') return respostaDeCampo(c, campoDoCorpo ?? r.campo, r.mensagem);
  return c.json({ alterado: r.alterado }, 200);
}

export function rotasPeriodos(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  for (const acao of ['inativar', 'reativar'] as const) {
    rotas.post(`/grupos/:grupoId/jogadores/:id/${acao}`, async (c) => {
      const id = c.req.param('id');
      if (!UUID.test(id)) return c.json(corpoDoErro('nao_encontrado'), 404);
      const corpo = await lerCorpoDoGrupo(c, dataCorpo);
      if (!corpo.ok) return corpo.resposta;
      const r = await jogadores[acao](c.var.db, c.req.param('grupoId'), id, corpo.dados, c.var.relogio.hoje());
      return respostaDePeriodo(c, r, 'data');
    });
  }

  return rotas;
}
