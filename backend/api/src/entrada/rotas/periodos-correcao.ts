import { Hono, type Context } from 'hono';
import {
  corpoDoErro,
  corrigirPeriodoCorpo,
  inicioCorpo,
  type CorrigirPeriodoResposta,
  type PreviaInicioResposta,
} from '@pelada/contrato';
import { avaliarInicio, previaDoInicio, previaDosPeriodos } from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo, respostaDeCampo } from '../corpo.ts';
import { historico } from '../../infraestrutura/db/repositorios/historico.ts';
import { jogadores } from '../../infraestrutura/db/repositorios/jogadores.ts';
import { jogadoresLeitura } from '../../infraestrutura/db/repositorios/jogadores-leitura.ts';
import { avaliarNaPrevia, respostaDaPrevia, respostaDePeriodo } from './periodos.ts';

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
async function respostaComPeriodos(
  c: Context<Ambiente>,
  grupoId: string,
  id: string,
  alterado: boolean,
) {
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
    const r = await jogadores.corrigirPeriodo(
      c.var.db,
      grupoId,
      id,
      periodoId,
      corpo.dados,
      c.var.relogio.hoje(),
    );
    if (r.resultado !== 'ok') return respostaDePeriodo(c, r);
    return respostaComPeriodos(c, grupoId, id, r.alterado);
  });

  rotas.put('/grupos/:grupoId/jogadores/:id/inicio', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const corpo = await lerCorpoDoGrupo(c, inicioCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const r = await jogadores.alterarInicio(
      c.var.db,
      grupoId,
      id,
      corpo.dados,
      c.var.relogio.hoje(),
    );
    if (r.resultado === 'nao_encontrado') return c.json(naoEncontrado, 404);
    if (r.resultado === 'invalido') return respostaDeCampo(c, 'data', r.mensagem);
    return respostaComPeriodos(c, grupoId, id, r.alterado);
  });

  /**
   * `POST …/jogadores/:id/periodos/:periodoId/previa` (partidas-e-ranking T42; PAR-110, PAR-112 a PAR-116, `BD:238`):
   * o corpo e as recusas do PATCH, na mesma ordem, sobre a leitura sem trava; nada grava (transação `READ ONLY`, T36).
   *
   * Casos limite e estados (Domínio: sim), listados antes do código:
   * - ids que não são uuid, jogador de outro grupo, ou período que não é desse jogador: 404 (GEL-75);
   * - saída de período aberto ou retorno do primeiro período: 422 `nao-corrigivel` no campo do domínio (GEL-72, GEL-73);
   * - qualquer outra regra de período: 422 no campo que falhou (`saida` ou `retorno`), com a mensagem do domínio;
   * - datas iguais às atuais (a gravação responderia "Nada a alterar."): a prévia mostra o cenário sem mudança, com
   *   os acumulados iguais e nenhuma rodada (o domínio recebe os mesmos períodos).
   *   [LACUNA] a Base não diz o que a prévia responde nesse caso; o rascunho devolve o cenário sem mudança, sem
   *   mensagem (interpretação conservadora: não inventa campo fora do `previaResposta`);
   * - saída adiada sobre rodadas sem presença: passam a constar como `falta`, com o aviso (PAR-114, PAR-116);
   * - saída antecipada: as rodadas do intervalo deixam de constar (PAR-114).
   */
  rotas.post('/grupos/:grupoId/jogadores/:id/periodos/:periodoId/previa', async (c) => {
    const id = c.req.param('id');
    const periodoId = c.req.param('periodoId');
    if (!UUID.test(id) || !UUID.test(periodoId)) return c.json(naoEncontrado, 404);
    const corpo = await lerCorpoDoGrupo(c, corrigirPeriodoCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const hoje = c.var.relogio.hoje();

    const estado = await jogadores.lerParaPrevia(c.var.db, grupoId, id);
    if (!estado || !estado.periodos.some((p) => p.id === periodoId))
      return c.json(naoEncontrado, 404);
    const r = avaliarNaPrevia(
      estado,
      { tipo: 'corrigir', periodoId, saida: corpo.dados.saida, retorno: corpo.dados.retorno },
      hoje,
    );
    if (!r.ok) return respostaDeCampo(c, r.campo, r.mensagem);

    const h = await historico.carregar(c.var.db, grupoId, hoje);
    return c.json(respostaDaPrevia(previaDosPeriodos(h, id, r.periodos, hoje)), 200);
  });

  /**
   * `POST …/jogadores/:id/inicio/previa` (partidas-e-ranking T42; PAR-111, PAR-112, PAR-115, `BD:239`): o corpo e as
   * recusas do PUT do início, sobre a leitura sem trava; a resposta tem só o número de rodadas que passam a constar.
   *
   * Casos limite e estados (Domínio: sim), listados antes do código:
   * - id que não é uuid ou jogador de outro grupo: 404;
   * - data inválida, antes do piso, no futuro ou depois da saída do primeiro período: 422 no campo `data` (GEL-78 a
   *   GEL-80);
   * - recuo para antes do primeiro período: as rodadas do intervalo passam a constar (o primeiro período recua junto);
   * - avanço dentro do primeiro período: as rodadas antes da nova data saem, e o número das que passam é 0;
   * - data igual à atual: o cenário de depois é o de antes (`previaDoInicio`, GEL-82).
   */
  rotas.post('/grupos/:grupoId/jogadores/:id/inicio/previa', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const corpo = await lerCorpoDoGrupo(c, inicioCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const hoje = c.var.relogio.hoje();

    const estado = await jogadores.lerParaPrevia(c.var.db, grupoId, id);
    if (!estado) return c.json(naoEncontrado, 404);
    const r = avaliarInicio({
      periodos: estado.periodos,
      inicioPontuacao: estado.inicioPontuacao,
      novaData: corpo.dados.data,
      hoje,
    });
    if (!r.ok) return respostaDeCampo(c, 'data', r.mensagem);

    const h = await historico.carregar(c.var.db, grupoId, hoje);
    const p = previaDoInicio(h, id, r.inicioPontuacao, hoje);
    const resposta: PreviaInicioResposta = {
      acumuladoAntes: p.acumuladoAntes,
      acumuladoDepois: p.acumuladoDepois,
      posicaoAntes: p.posicaoAntes,
      posicaoDepois: p.posicaoDepois,
      rodadasQuePassamAConstar: p.rodadasQuePassamAConstar,
    };
    return c.json(resposta, 200);
  });

  return rotas;
}
