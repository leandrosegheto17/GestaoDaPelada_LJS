import { Hono, type Context } from 'hono';
import { corpoDoErro, habilidadeCorpo, type ListaHabilidades } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import {
  comUnicidade,
  lerCorpoDoGrupo,
  MENSAGEM_HABILIDADE_REPETIDA,
  respostaDeCampo,
} from '../corpo.ts';
import {
  habilidades,
  type ResultadoHabilidade,
} from '../../infraestrutura/db/repositorios/habilidades.ts';

/**
 * `GET` e `POST /api/grupos/:grupoId/habilidades`, `PATCH` e `DELETE /api/grupos/:grupoId/habilidades/:id` (T47;
 * GEL-88 a GEL-93, GEL-96), da tabela de `GD:177`. A cadeia do grupo vem antes.
 *
 * - GET 200 `{ habilidades }` na ordem de cadastro (GEL-88); POST 201 com a habilidade (GEL-89); PATCH 200 com a
 *   habilidade renomeada (GEL-92); DELETE 204 (GEL-93).
 * - Nome fora de 2 a 30 (GEL-90) ou repetido sem caixa (GEL-91): 422 no campo `nome`; a corrida que passar pela
 *   consulta cai no 23505 e vira o mesmo 422 (`comUnicidade`).
 * - Habilidade de outro grupo ou id que não é uuid: 404 (GEL-96).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function respostaDeHabilidade(
  c: Context<Ambiente>,
  r: ResultadoHabilidade,
  status: 200 | 201,
): Response {
  if (r.resultado === 'nao_encontrada') return c.json(corpoDoErro('nao_encontrado'), 404);
  if (r.resultado === 'nome_repetido')
    return respostaDeCampo(c, 'nome', MENSAGEM_HABILIDADE_REPETIDA);
  return c.json(r.habilidade, status);
}

export function rotasHabilidades(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const naoEncontrado = corpoDoErro('nao_encontrado');

  rotas.get('/grupos/:grupoId/habilidades', async (c) => {
    const resposta: ListaHabilidades = {
      habilidades: await habilidades.listar(c.var.db, c.req.param('grupoId')),
    };
    return c.json(resposta, 200);
  });

  rotas.post('/grupos/:grupoId/habilidades', async (c) => {
    const corpo = await lerCorpoDoGrupo(c, habilidadeCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    return comUnicidade(c, async () =>
      respostaDeHabilidade(c, await habilidades.criar(c.var.db, grupoId, corpo.dados), 201),
    );
  });

  rotas.patch('/grupos/:grupoId/habilidades/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const corpo = await lerCorpoDoGrupo(c, habilidadeCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    return comUnicidade(c, async () =>
      respostaDeHabilidade(c, await habilidades.renomear(c.var.db, grupoId, id, corpo.dados), 200),
    );
  });

  rotas.delete('/grupos/:grupoId/habilidades/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const r = await habilidades.excluir(c.var.db, c.req.param('grupoId'), id);
    if (r.resultado === 'nao_encontrada') return c.json(naoEncontrado, 404);
    return c.body(null, 204);
  });

  return rotas;
}
