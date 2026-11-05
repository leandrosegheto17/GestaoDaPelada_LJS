import { Hono } from 'hono';
import { corpoDoErro, pesosCorpo } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo } from '../corpo.ts';
import { pesos } from '../../infraestrutura/db/repositorios/pesos.ts';

/**
 * `GET` e `POST /api/grupos/:grupoId/pesos` (partidas-e-ranking T38; PAR-01, PAR-03, PAR-06, PAR-07, PAR-08), da
 * tabela de `BD:227-228`. A cadeia do grupo vem antes (sessão, vínculo 404, grupo ativo 409 na escrita); o `hoje` é o
 * do relógio da requisição.
 *
 * - GET 200 com o painel (PAR-01); sem configuração até hoje, 404 (todo grupo tem uma desde a T21 e a T22: só a RLS
 *   escondendo o grupo chega aqui, e o vínculo já respondeu antes).
 * - POST: corpo pelo `pesosCorpo` (422 no campo do peso, PAR-06, PAR-07; `vigenteDesde` ou outro campo, 422 sem
 *   gravar, PAR-08), grava com vigência hoje (PAR-03, PAR-04) e responde 200 com o painel atualizado.
 */

export function rotasPesos(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.get('/grupos/:grupoId/pesos', async (c) => {
    const painel = await pesos.painel(c.var.db, c.req.param('grupoId'), c.var.relogio.hoje());
    if (!painel) return c.json(corpoDoErro('nao_encontrado'), 404);
    return c.json(painel, 200);
  });

  rotas.post('/grupos/:grupoId/pesos', async (c) => {
    const corpo = await lerCorpoDoGrupo(c, pesosCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const hoje = c.var.relogio.hoje();
    await pesos.salvar(c.var.db, grupoId, corpo.dados, hoje);
    const painel = await pesos.painel(c.var.db, grupoId, hoje);
    // Acabou de gravar a de hoje na mesma transação: sem painel, é erro (500, e o `comBanco` desfaz).
    if (!painel) throw new Error('painel de pesos vazio depois de salvar');
    return c.json(painel, 200);
  });

  return rotas;
}
