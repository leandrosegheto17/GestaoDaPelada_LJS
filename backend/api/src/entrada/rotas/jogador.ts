import { Hono } from 'hono';
import { corpoDoErro, editarJogadorCorpo } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import {
  comUnicidade,
  lerCorpoDoGrupo,
  MENSAGEM_APELIDO_REPETIDO,
  respostaDeCampo,
} from '../corpo.ts';
import { jogadoresEdicao } from '../../infraestrutura/db/repositorios/jogadores-edicao.ts';
import { jogadoresLeitura } from '../../infraestrutura/db/repositorios/jogadores-leitura.ts';
import { UUID } from '../uuid.ts';

/**
 * `GET`, `PATCH` e `DELETE /api/grupos/:grupoId/jogadores/:id` (T37; GEL-41, GEL-44, GEL-84, GEL-85), da tabela de
 * `GD:173`. A cadeia do grupo vem antes. Jogador de fora do grupo (ou id que não é uuid): 404 nos três (GEL-44).
 *
 * - PATCH: as validações do cadastro, sem a data de entrada; a `dataEntrada` enviada é ignorada, não recusada (GEL-41),
 *   e só muda pela rota de início (GEL-83). Devolve a ficha.
 * - DELETE: 204 sem histórico (GEL-84); com histórico, 409 `jogador_com_historico` com a mensagem de `GS:295` e
 *   `sugestao: "inativar"` (GEL-85).
 */

/** GEL-85, texto de `GS:295`. */
export function mensagemComHistorico(apelido: string): string {
  return `${apelido} tem histórico de partidas e não pode ser excluído.`;
}

/** Tira a `dataEntrada` do corpo do PATCH (GEL-41); o resto segue para o schema `.strict()`. */
function semDataEntrada(bruto: unknown): unknown {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return bruto;
  const { dataEntrada: _ignorada, ...resto } = bruto as Record<string, unknown>;
  return resto;
}

export function rotasJogador(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const naoEncontrado = corpoDoErro('nao_encontrado');

  rotas.get('/grupos/:grupoId/jogadores/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const ficha = await jogadoresLeitura.ler(c.var.db, c.req.param('grupoId'), id);
    if (!ficha) return c.json(naoEncontrado, 404);
    return c.json(ficha, 200);
  });

  rotas.patch('/grupos/:grupoId/jogadores/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const corpo = await lerCorpoDoGrupo(
      c,
      editarJogadorCorpo(c.var.relogio.hoje()),
      semDataEntrada,
    );
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    return comUnicidade(c, async () => {
      const r = await jogadoresEdicao.editar(c.var.db, grupoId, id, corpo.dados);
      if (r.resultado === 'nao_encontrado') return c.json(naoEncontrado, 404);
      if (r.resultado === 'apelido_repetido')
        return respostaDeCampo(c, 'apelido', MENSAGEM_APELIDO_REPETIDO);
      const ficha = await jogadoresLeitura.ler(c.var.db, grupoId, id);
      if (!ficha) return c.json(naoEncontrado, 404);
      return c.json(ficha, 200);
    });
  });

  rotas.delete('/grupos/:grupoId/jogadores/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const r = await jogadoresEdicao.excluir(c.var.db, c.req.param('grupoId'), id);
    if (r.resultado === 'nao_encontrado') return c.json(naoEncontrado, 404);
    if (r.resultado === 'com_historico') {
      return c.json(
        {
          ...corpoDoErro('jogador_com_historico', { sugestao: 'inativar' }),
          erro: mensagemComHistorico(r.apelido),
        },
        409,
      );
    }
    return c.body(null, 204);
  });

  return rotas;
}
