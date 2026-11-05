import { Hono, type Context } from 'hono';
import { corpoDoErro, corrigirPeriodoCorpo, inicioCorpo, type CorrigirPeriodoResposta } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo, respostaDeCampo } from '../corpo.ts';
import { jogadores } from '../../infraestrutura/db/repositorios/jogadores.ts';
import { jogadoresLeitura } from '../../infraestrutura/db/repositorios/jogadores-leitura.ts';
import { respostaDePeriodo } from './periodos.ts';

/**
 * `PATCH /api/grupos/:grupoId/jogadores/:id/periodos/:periodoId` e `PUT …/jogadores/:id/inicio` (T43; GEL-71 a
 * GEL-75, GEL-77 a GEL-80, GEL-82), da tabela de `GD:175-176`. A cadeia do grupo vem antes.
 *
 * - PATCH: corpo `corrigirPeriodoCorpo` (saída e/ou retorno); 422 da regra no campo do corpo que falhou (`saida` ou
 *   `retorno`, GEL-72, GEL-73); período que não é daquele jogador do grupo: 404 (GEL-75).
 * - PUT: corpo `inicioCorpo`; 422 no campo `data` com a mensagem do domínio (GEL-78 a GEL-80).
 * - As duas respondem 200 `corrigirPeriodoResposta`: `alterado`, os períodos depois da escrita e, quando nada mudou,
 *   "Nada a alterar." (GEL-74, GEL-82).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GEL-74, texto de `GS:258`. */
export const MENSAGEM_NADA_A_ALTERAR = 'Nada a alterar.';

/** 200 com os períodos atuais do jogador, lidos na mesma transação. */
async function respostaComPeriodos(c: Context<Ambiente>, grupoId: string, id: string, alterado: boolean) {
  const ficha = await jogadoresLeitura.ler(c.var.db, grupoId, id);
  if (!ficha) return c.json(corpoDoErro('nao_encontrado'), 404);
  const corpo: CorrigirPeriodoResposta = {
    alterado,
    ...(alterado ? {} : { mensagem: MENSAGEM_NADA_A_ALTERAR }),
    periodos: ficha.periodos,
  };
  return c.json(corpo, 200);
}

export function rotasPeriodosCorrecao(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const naoEncontrado = corpoDoErro('nao_encontrado');

  rotas.patch('/grupos/:grupoId/jogadores/:id/periodos/:periodoId', async (c) => {
    const id = c.req.param('id');
    const periodoId = c.req.param('periodoId');
    if (!UUID.test(id) || !UUID.test(periodoId)) return c.json(naoEncontrado, 404);
    const corpo = await lerCorpoDoGrupo(c, corrigirPeriodoCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const r = await jogadores.corrigirPeriodo(c.var.db, grupoId, id, periodoId, corpo.dados, c.var.relogio.hoje());
    if (r.resultado !== 'ok') return respostaDePeriodo(c, r);
    return respostaComPeriodos(c, grupoId, id, r.alterado);
  });

  rotas.put('/grupos/:grupoId/jogadores/:id/inicio', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const corpo = await lerCorpoDoGrupo(c, inicioCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const r = await jogadores.alterarInicio(c.var.db, grupoId, id, corpo.dados, c.var.relogio.hoje());
    if (r.resultado === 'nao_encontrado') return c.json(naoEncontrado, 404);
    if (r.resultado === 'invalido') return respostaDeCampo(c, 'data', r.mensagem);
    return respostaComPeriodos(c, grupoId, id, r.alterado);
  });

  return rotas;
}
