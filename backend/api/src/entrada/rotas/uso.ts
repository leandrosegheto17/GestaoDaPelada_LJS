import { Hono } from 'hono';
import type { UsoResposta } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { eventos } from '../../infraestrutura/db/repositorios/eventos.ts';

/**
 * `GET /api/grupos/:grupoId/uso` (partidas-e-ranking T44; PAR-155 a PAR-158, `BD:235`): o painel de uso do grupo, uma
 * linha por semana com evento, da mais recente para a mais antiga (`eventos.porSemana`). A cadeia do grupo vem antes
 * (sessão, vínculo 404); é GET, então a transação é `READ ONLY`. `escalacoesConfirmadas` é 0 nesta feature.
 */

export function rotasUso(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.get('/grupos/:grupoId/uso', async (c) => {
    const resposta: UsoResposta = { semanas: await eventos.porSemana(c.var.db, c.req.param('grupoId')) };
    return c.json(resposta, 200);
  });

  return rotas;
}
