import { Hono } from 'hono';
import {
  corpoDoErro,
  lancamentoCorpo,
  MENSAGEM_MENSALIDADE_ENTRADA,
  mensagemLancamentoVinculado,
  type LancamentoResposta,
} from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo, respostaDeCampo } from '../corpo.ts';
import {
  lancamentos,
  type LancamentoLido,
} from '../../infraestrutura/db/repositorios/financeiro/lancamentos.ts';
import { lancamentosExcluir } from '../../infraestrutura/db/repositorios/financeiro/lancamentos-excluir.ts';

/**
 * Lançamentos do caixa (financeiro T28; FIN-25 a FIN-31). A cadeia vem antes: vínculo (404), grupo ativo (409 nas
 * escritas), LIMITE_ESCRITA, `exigirFinanceiro` (403) e a trava de plano nas escritas (403 `plano_pro`).
 *
 * - `POST …/financeiro/lancamentos`: corpo `lancamentoCorpo` (T8; descrição de 1 a 80 caracteres sem os espaços das
 *   pontas, valor inteiro de 1 a 99.999.999, data real, tipo entrada ou saída; campo extra, inclusive de vínculo com
 *   mensalidade, dá 422, FIN-26); cria o avulso e responde 201 com o lançamento, `mensalidade` falso, quem alterou e
 *   quando (FIN-25).
 * - `GET …/financeiro/lancamentos/:id`: o lançamento (FIN-32).
 * - `PUT …/financeiro/lancamentos/:id`: mesmo corpo; 200 com o lançamento; a mensalidade segue vinculada (FIN-27);
 *   mensalidade para saída dá 422 no campo `tipo` (FIN-28).
 * - `DELETE …/financeiro/lancamentos/:id`: 204 no avulso (FIN-29); a entrada da mensalidade dá 409
 *   `lancamento_vinculado` com a orientação de desmarcar, inclusive em corrida (FIN-30).
 * - id inexistente, de outro grupo ou malformado: o mesmo 404 nos quatro métodos (FIN-31).
 *
 * A resposta não traz o `vinculo` do repositório (o contrato é `.strict()`). Molde: `GET`, `PATCH` e `DELETE
 * …/jogadores/:id` (`rotas/jogador.ts:36`); o `partidas/:data` de `PR:1487` ainda não existe.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paraResposta(l: LancamentoLido): LancamentoResposta {
  return {
    id: l.id,
    tipo: l.tipo,
    data: l.data,
    descricao: l.descricao,
    valorCentavos: l.valorCentavos,
    mensalidade: l.mensalidade,
    alteradoPor: l.alteradoPor,
    alteradoEm: l.alteradoEm,
  };
}

export function rotasFinanceiroLancamentos(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const naoEncontrado = corpoDoErro('nao_encontrado');

  rotas.post('/grupos/:grupoId/financeiro/lancamentos', async (c) => {
    const corpo = await lerCorpoDoGrupo(c, lancamentoCorpo);
    if (!corpo.ok) return corpo.resposta;
    const criado = await lancamentos.criar(c.var.db, c.req.param('grupoId'), corpo.dados);
    return c.json(paraResposta(criado), 201);
  });

  rotas.get('/grupos/:grupoId/financeiro/lancamentos/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const lido = await lancamentos.ler(c.var.db, c.req.param('grupoId'), id);
    if (!lido) return c.json(naoEncontrado, 404);
    return c.json(paraResposta(lido), 200);
  });

  rotas.put('/grupos/:grupoId/financeiro/lancamentos/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const corpo = await lerCorpoDoGrupo(c, lancamentoCorpo);
    if (!corpo.ok) return corpo.resposta;
    const r = await lancamentos.editar(c.var.db, c.req.param('grupoId'), id, corpo.dados);
    if (r.resultado === 'nao_encontrado') return c.json(naoEncontrado, 404);
    if (r.resultado === 'mensalidade_nao_e_saida')
      return respostaDeCampo(c, 'tipo', MENSAGEM_MENSALIDADE_ENTRADA);
    return c.json(paraResposta(r.lancamento), 200);
  });

  rotas.delete('/grupos/:grupoId/financeiro/lancamentos/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const r = await lancamentosExcluir.excluir(c.var.db, c.req.param('grupoId'), id);
    if (r.resultado === 'nao_encontrado') return c.json(naoEncontrado, 404);
    if (r.resultado === 'vinculado') {
      return c.json(
        {
          erro: mensagemLancamentoVinculado(r.apelido, r.mes),
          codigo: 'lancamento_vinculado' as const,
        },
        409,
      );
    }
    return c.body(null, 204);
  });

  return rotas;
}
