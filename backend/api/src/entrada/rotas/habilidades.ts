import { habilidadeCorpo, type HabilidadeItem, type ListaHabilidades } from '@pelada/contrato';
import { Hono } from 'hono';
import * as habilidades from '../../infraestrutura/db/repositorios/habilidades.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { naoEncontrado } from '../erros.ts';
import { recusaDeCampo, UUID } from './jogadores.ts';

/**
 * Habilidades do grupo (grupos-e-elenco, design C6; GEL-88 a GEL-96). A sessão, o vínculo e o grupo ativo já foram
 * exigidos em `/api/grupos/:grupoId/*`. O nome é validado pelo contrato (GEL-90); a unicidade, pelo repositório
 * (GEL-91).
 */
export const rotaHabilidades = new Hono<AppEnv>()
  .get('/api/grupos/:grupoId/habilidades', async (c) => {
    const lista = await habilidades.listar(c.var.db, c.req.param('grupoId'));
    const resposta: ListaHabilidades = { habilidades: lista };
    return c.json(resposta);
  })
  .post('/api/grupos/:grupoId/habilidades', async (c) => {
    const corpo = await lerCorpo(c, habilidadeCorpo);
    if (!corpo.ok) return corpo.resposta;
    const criada = await habilidades.criar(c.var.db, c.req.param('grupoId'), corpo.dado.nome);
    if (!criada.ok) return recusaDeCampo(c, criada.campo, criada.mensagem);
    const resposta: HabilidadeItem = { id: criada.id, nome: corpo.dado.nome };
    return c.json(resposta, 201);
  })
  .patch('/api/grupos/:grupoId/habilidades/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return naoEncontrado(c);
    const corpo = await lerCorpo(c, habilidadeCorpo);
    if (!corpo.ok) return corpo.resposta;
    const r = await habilidades.renomear(c.var.db, c.req.param('grupoId'), id, corpo.dado.nome);
    if (!r) return naoEncontrado(c);
    if (!r.ok) return recusaDeCampo(c, r.campo, r.mensagem);
    const resposta: HabilidadeItem = { id, nome: corpo.dado.nome };
    return c.json(resposta);
  })
  .delete('/api/grupos/:grupoId/habilidades/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return naoEncontrado(c);
    const r = await habilidades.excluir(c.var.db, c.req.param('grupoId'), id);
    if (!r) return naoEncontrado(c);
    return c.body(null, 204);
  });
