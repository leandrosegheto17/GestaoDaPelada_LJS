import { notaCorpo, type NotaResposta } from '@pelada/contrato';
import { Hono } from 'hono';
import * as notas from '../../infraestrutura/db/repositorios/notas.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { naoEncontrado } from '../erros.ts';
import { UUID } from './jogadores.ts';

/**
 * Nota do jogador numa habilidade (grupos-e-elenco, design C6; GEL-97 a GEL-100, GEL-105). A sessão, o vínculo e o
 * grupo ativo já foram exigidos em `/api/grupos/:grupoId/*`. A nota é validada pelo contrato (GEL-99).
 */
export const rotaNotas = new Hono<AppEnv>().put('/api/grupos/:grupoId/jogadores/:id/notas/:habilidadeId', async (c) => {
  const id = c.req.param('id');
  const habilidadeId = c.req.param('habilidadeId');
  if (!UUID.test(id) || !UUID.test(habilidadeId)) return naoEncontrado(c);
  const corpo = await lerCorpo(c, notaCorpo);
  if (!corpo.ok) return corpo.resposta;
  const nivel = await notas.salvar(c.var.db, c.req.param('grupoId'), id, habilidadeId, corpo.dado.nota);
  if (!nivel) return naoEncontrado(c);
  const resposta: NotaResposta = nivel;
  return c.json(resposta);
});
