import { Hono, type Context } from 'hono';
import { corpoDoErro, dataCorpo, type PreviaResposta } from '@pelada/contrato';
import { avaliarPeriodos, previaDosPeriodos, type OperacaoPeriodo, type PreviaDosPeriodos } from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo, respostaDeCampo } from '../corpo.ts';
import { historico } from '../../infraestrutura/db/repositorios/historico.ts';
import { jogadores, type EstadoDoJogador, type ResultadoPeriodo } from '../../infraestrutura/db/repositorios/jogadores.ts';
import { conferirLimiteDeJogadores } from '../../aplicacao/plano/limite-jogadores.ts';
import { respostaSomenteLeitura } from '../middlewares/plano-editavel.ts';

/**
 * `POST /api/grupos/:grupoId/jogadores/:id/inativar` e `…/reativar` (T42; GEL-51 a GEL-56), da tabela de `GD:174`.
 * A cadeia do grupo vem antes. Corpo `dataCorpo`: sem data, o repositório usa o hoje do relógio da requisição
 * (GEL-52, GEL-55). Respostas:
 * - 200 `{ alterado: true }`;
 * - 409 `ja_inativo` ("O jogador já está inativo.", GEL-53) ou `ja_ativo` ("O jogador já está ativo.", GEL-56);
 * - 422 da regra de período (GEL-58) no campo `data`, o único do corpo;
 * - 404 para jogador de fora do grupo ou id que não é uuid (GEL-44).
 *
 * `POST …/reativar/previa` (partidas-e-ranking T42; PAR-109, PAR-112 a PAR-116, `BD:237`): o mesmo corpo e as mesmas
 * recusas da gravação, na mesma ordem (404, 409 `ja_ativo`, 422 no campo `data`), sobre a leitura sem trava
 * (`lerParaPrevia`); depois o histórico do grupo e o domínio (`previaDosPeriodos`). Roda em transação `READ ONLY`
 * (sufixo `/previa`, T36) e nada grava.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O resultado do repositório na resposta HTTP. */
export function respostaDePeriodo(c: Context<Ambiente>, r: ResultadoPeriodo, campoDoCorpo?: string): Response {
  if (r.resultado === 'nao_encontrado') return c.json(corpoDoErro('nao_encontrado'), 404);
  if (r.resultado === 'ja_inativo') return c.json(corpoDoErro('ja_inativo'), 409);
  if (r.resultado === 'ja_ativo') return c.json(corpoDoErro('ja_ativo'), 409);
  if (r.resultado === 'invalido') return respostaDeCampo(c, campoDoCorpo ?? r.campo, r.mensagem);
  return c.json({ alterado: r.alterado }, 200);
}

/** As regras de período do domínio sobre o estado lido, como na gravação (`jogadores.ts`, `avaliar`). */
export function avaliarNaPrevia(estado: EstadoDoJogador, operacao: OperacaoPeriodo, hoje: string) {
  return avaliarPeriodos({
    periodos: estado.periodos,
    operacao,
    presencas: estado.presencas,
    inicioPontuacao: estado.inicioPontuacao,
    hoje,
  });
}

/** A prévia do domínio na forma do contrato, campo a campo (o contrato é estrito). */
export function respostaDaPrevia(p: PreviaDosPeriodos): PreviaResposta {
  return {
    acumuladoAntes: p.acumuladoAntes,
    acumuladoDepois: p.acumuladoDepois,
    posicaoAntes: p.posicaoAntes,
    posicaoDepois: p.posicaoDepois,
    rodadasQuePassamAConstar: p.rodadasQuePassamAConstar.map((r) => ({ data: r.data, situacao: r.situacao })),
    rodadasQueDeixamDeConstar: p.rodadasQueDeixamDeConstar.map((r) => ({ data: r.data })),
    aviso: p.aviso,
  };
}

export function rotasPeriodos(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  for (const acao of ['inativar', 'reativar'] as const) {
    rotas.post(`/grupos/:grupoId/jogadores/:id/${acao}`, async (c) => {
      const id = c.req.param('id');
      if (!UUID.test(id)) return c.json(corpoDoErro('nao_encontrado'), 404);
      const corpo = await lerCorpoDoGrupo(c, dataCorpo);
      if (!corpo.ok) return corpo.resposta;
      if (acao === 'reativar') {
        // Limite do Free com trava por grupo, na transação da rota (planos-e-cobranca T23; PLA-16, PLA-21).
        const limite = await conferirLimiteDeJogadores(
          c.var.db,
          c.req.param('grupoId'),
          c.var.relogio.hoje(),
          'reativar_jogador',
        );
        if (limite !== null) return respostaSomenteLeitura(c, limite);
      }
      const r = await jogadores[acao](c.var.db, c.req.param('grupoId'), id, corpo.dados, c.var.relogio.hoje());
      return respostaDePeriodo(c, r, 'data');
    });
  }

  /**
   * Casos limite e estados (Domínio: sim), listados antes do código:
   * - id que não é uuid, ou jogador de outro grupo: 404, como a gravação;
   * - jogador já ativo (há período aberto): 409 `ja_ativo`, como a gravação (PAR-112);
   * - sem data: o retorno é hoje; data inválida, no futuro ou antes da saída anterior: 422 no campo `data` com a
   *   mensagem do domínio (PAR-112);
   * - retorno no dia da saída anterior: vale (GEL-61), e a prévia mostra o cenário;
   * - retorno que traz de volta rodadas sem presença: elas passam a constar como `falta`, com o aviso no singular ou no
   *   plural (PAR-114, PAR-116);
   * - jogador inativo hoje antes da reativação: `posicaoAntes` nula (PAR-113);
   * - grupo arquivado: 409 `grupo_arquivado` antes da rota (T36, PAR-112).
   */
  rotas.post('/grupos/:grupoId/jogadores/:id/reativar/previa', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(corpoDoErro('nao_encontrado'), 404);
    const corpo = await lerCorpoDoGrupo(c, dataCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const hoje = c.var.relogio.hoje();

    const estado = await jogadores.lerParaPrevia(c.var.db, grupoId, id);
    if (!estado) return c.json(corpoDoErro('nao_encontrado'), 404);
    if (estado.periodos.some((p) => p.fim === null)) return c.json(corpoDoErro('ja_ativo'), 409);

    const retorno = corpo.dados.data ?? hoje;
    const r = avaliarNaPrevia(estado, { tipo: 'reativar', retorno }, hoje);
    if (!r.ok) return respostaDeCampo(c, 'data', r.mensagem);

    const h = await historico.carregar(c.var.db, grupoId, hoje);
    return c.json(respostaDaPrevia(previaDosPeriodos(h, id, r.periodos, hoje)), 200);
  });

  return rotas;
}
