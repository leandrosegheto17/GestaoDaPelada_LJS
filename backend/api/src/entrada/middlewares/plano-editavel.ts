import type { MiddlewareHandler } from 'hono';
import { MENSAGENS_ERRO_PLANO } from '@pelada/contrato';
import { planoEfetivo, somenteLeitura, type OperacaoDeEscrita } from '@pelada/dominio';
import { estadoDoPlano } from '../../aplicacao/plano/recurso-liberado.ts';
import { plano as repositorioPlano } from '../../infraestrutura/db/repositorios/plano.ts';
import type { Ambiente } from '../ambiente.ts';
import { ehPrevia } from './com-banco.ts';

/**
 * Somente leitura do excedente do Free (planos-e-cobranca T22; PLA-15, PLA-17, PLA-18, PLA-20, PLA-21; AD-062,
 * AD-092). Roda na cadeia das rotas de grupo, depois do `exigirGrupoAtivo`, na mesma transação da requisição: lê o
 * plano (`estadoDoPlano`, T21) e, no Free, os grupos da criadora (T20), e pergunta ao domínio (`somenteLeitura`, T5).
 * Com motivo, responde 403 `{ erro: 'somente_leitura', motivo, mensagem }` antes da rota, sem gravar nada (PLA-21).
 * Nada é apagado nem escondido (PLA-18): GET e HEAD nunca passam por aqui. Deixou de exceder (inativou um, PLA-20): a
 * próxima requisição lê de novo e passa, sem estado guardado.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - prévia (`POST …/previa`): só leitura (`READ ONLY`, PAR-109), passa sem consultar (AD-092);
 * - `POST …/jogadores/:id/inativar`: nunca trava, nem com 25 ativos nem no grupo que não é o mais antigo (PLA-15);
 * - `POST …/jogadores` (cadastrar) e `POST …/jogadores/:id/reativar`: travam já com 20 ativos (PLA-16; a contagem
 *   concorrente com trava é da T23);
 * - `PATCH /api/grupos/:grupoId` (editar o grupo): trava como qualquer escrita (AD-092);
 * - 21 ativos, depois de inativar um (20): a escrita comum passa de novo (PLA-20);
 * - segundo grupo Free da criadora: 403 `limite_grupos`, também para a admin convidada (a lista vem da função
 *   `SECURITY DEFINER`, PLA-17);
 * - grupo em trial válido, Pro ou cortesia: nada trava, sem ler a lista da criadora;
 * - fora da trava (AD-092): arquivar e reativar o grupo, admins e convites, plano, assinatura, simulador, escalações,
 *   financeiro e uso (simulador e financeiro respondem `plano_pro` pela trava de recurso, nunca `somente_leitura`);
 * - escrita sob `/api/grupos/:grupoId` que não está em nenhuma das duas listas: trava (conservador); o meta-teste da
 *   T28 reprova rota nova sem linha na tabela;
 * - grupo que a função não devolve (corrida com a remoção do vínculo): segue, e a rota responde o seu 404.
 */

/** Escritas fora da trava de somente leitura (AD-092). Caminho inteiro (`/api/grupos/<id>/...`), sem barra final. */
export const ESCRITAS_FORA_DA_TRAVA: readonly RegExp[] = [
  /^\/api\/grupos\/[^/]+\/(arquivar|reativar)$/,
  /^\/api\/grupos\/[^/]+\/admins(\/.*)?$/,
  /^\/api\/grupos\/[^/]+\/plano(\/.*)?$/,
  /^\/api\/grupos\/[^/]+\/assinatura(\/.*)?$/,
  /^\/api\/grupos\/[^/]+\/simulador(\/.*)?$/,
  /^\/api\/grupos\/[^/]+\/escalacoes(\/.*)?$/,
  /^\/api\/grupos\/[^/]+\/financeiro(\/.*)?$/,
  /^\/api\/grupos\/[^/]+\/uso(\/.*)?$/,
];

/** Escritas na trava (AD-092): grupo, jogadores, períodos, habilidades, notas, partidas e pesos. */
export const ESCRITAS_NA_TRAVA: readonly RegExp[] = [
  /^\/api\/grupos\/[^/]+$/,
  /^\/api\/grupos\/[^/]+\/jogadores(\/.*)?$/,
  /^\/api\/grupos\/[^/]+\/habilidades(\/.*)?$/,
  /^\/api\/grupos\/[^/]+\/partidas(\/.*)?$/,
  /^\/api\/grupos\/[^/]+\/pesos(\/.*)?$/,
];

const CADASTRAR = /^\/api\/grupos\/[^/]+\/jogadores$/;
const REATIVAR_JOGADOR = /^\/api\/grupos\/[^/]+\/jogadores\/[^/]+\/reativar$/;
const INATIVAR_JOGADOR = /^\/api\/grupos\/[^/]+\/jogadores\/[^/]+\/inativar$/;

/**
 * A operação que a requisição é para a regra do excedente, ou `null` quando ela não passa pela trava (leitura, prévia
 * ou escrita fora, AD-092).
 */
export function operacaoNaTrava(metodo: string, caminho: string): OperacaoDeEscrita | null {
  const m = metodo.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return null;
  if (ehPrevia(caminho)) return null;
  if (ESCRITAS_FORA_DA_TRAVA.some((r) => r.test(caminho))) return null;
  if (m === 'POST' && CADASTRAR.test(caminho)) return 'cadastrar_jogador';
  if (m === 'POST' && REATIVAR_JOGADOR.test(caminho)) return 'reativar_jogador';
  if (m === 'POST' && INATIVAR_JOGADOR.test(caminho)) return 'inativar_jogador';
  // Nas listas da trava ou em nenhuma: trava (conservador; a T28 reprova rota nova sem linha).
  return 'escrita';
}

export const exigirPlanoEditavel: MiddlewareHandler<Ambiente> = async (c, next) => {
  const operacao = operacaoNaTrava(c.req.method, c.req.path);
  if (operacao === null) {
    await next();
    return;
  }
  const grupoId = c.req.param('grupoId') ?? '';
  const hoje = c.var.relogio.hoje();
  const estado = await estadoDoPlano(c.var.db, grupoId, hoje);
  if (estado === null || estado.plano !== 'free') {
    await next();
    return;
  }
  const daCriadora = await repositorioPlano.gruposDaCriadora(c.var.db, grupoId);
  const gruposFreeDaCriadora = daCriadora
    .filter((g) => planoEfetivo(g.situacaoComercial, g.trialInicio, g.pagoAte, hoje) === 'free')
    .map((g) => ({ id: g.id, criadoEm: g.criadoEm }));
  const motivo = somenteLeitura({
    plano: estado.plano,
    jogadoresAtivos: estado.jogadoresAtivos,
    gruposFreeDaCriadora,
    grupoId,
    operacao,
  });
  if (motivo !== null) {
    return c.json({ erro: 'somente_leitura', motivo, mensagem: MENSAGENS_ERRO_PLANO.somente_leitura }, 403);
  }
  await next();
};
