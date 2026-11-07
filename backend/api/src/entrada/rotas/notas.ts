import { Hono } from 'hono';
import { corpoDoErro, notaCorpo, type NotaResposta } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo } from '../corpo.ts';
import { notas } from '../../infraestrutura/db/repositorios/notas.ts';
import { UUID } from '../uuid.ts';

/**
 * `PUT /api/grupos/:grupoId/jogadores/:id/notas/:habilidadeId` (T48; GEL-97 a GEL-100, GEL-105), da tabela de
 * `GD:178`. A cadeia do grupo vem antes. Corpo `notaCorpo`: inteiro de 1 a 10 grava (criando ou substituindo), `null`
 * apaga; fora disso, 422 no campo `nota` (GEL-99). Jogador ou habilidade de outro grupo, ou id que não é uuid: 404
 * (GEL-100). Responde 200 `{ nivel, semNota }` do jogador depois da escrita (GEL-97).
 */

export function rotasNotas(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const naoEncontrado = corpoDoErro('nao_encontrado');

  rotas.put('/grupos/:grupoId/jogadores/:id/notas/:habilidadeId', async (c) => {
    const id = c.req.param('id');
    const habilidadeId = c.req.param('habilidadeId');
    if (!UUID.test(id) || !UUID.test(habilidadeId)) return c.json(naoEncontrado, 404);
    const corpo = await lerCorpoDoGrupo(c, notaCorpo);
    if (!corpo.ok) return corpo.resposta;
    const r = await notas.salvar(
      c.var.db,
      c.req.param('grupoId'),
      id,
      habilidadeId,
      corpo.dados.nota,
    );
    if (r.resultado === 'nao_encontrado') return c.json(naoEncontrado, 404);
    const resposta: NotaResposta = r.nivel;
    return c.json(resposta, 200);
  });

  return rotas;
}
