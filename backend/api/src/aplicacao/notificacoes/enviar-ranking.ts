import { LOTE_MAXIMO, type MensagemRanking } from '@pelada/contrato/fila-avisos';
import { payloadRanking, planoEfetivo, planoLibera, serializarPayload, type Data } from '@pelada/dominio';
import type { CasoDeUso, Desfecho } from '../../entrada/consumidor-avisos.ts';
import { push } from '../../infraestrutura/db/repositorios/push.ts';
import { enviarPush, TTL_RANKING, type Reportar } from '../../infraestrutura/push/enviar.ts';
import { topicoDoGrupo } from '../../infraestrutura/push/topico.ts';
import { chavesVapidDoAmbiente, novoCacheVapid } from '../../infraestrutura/push/vapid.ts';
import { dataEmSaoPaulo } from '../../infraestrutura/relogio.ts';

/**
 * Envio do aviso de ranking atualizado (notificacoes T18; NOT-24, NOT-29, NOT-30, NOT-61, NOT-68; AD-049, AD-070),
 * o caso de uso `ranking` do consumidor da fila (T17). A retentativa e a continuação do lote são da T19.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - sem as três variáveis VAPID: encerra sem abrir o banco e sem nenhum `fetch` (NOT-61);
 * - grupo que não existe mais ou arquivado: encerra sem enviar (NOT-24);
 * - plano no momento do envio, não no do commit (NOT-24, NOT-68): `trial` vigente, `pro` e `cortesia` enviam; `free`
 *   (inclusive o trial vencido e o grupo que caiu para Free entre o commit e o envio) encerra sem enviar;
 * - grupo sem assinatura pendente (nenhuma, ou todas já com envio aceito desde `criadoEm`): encerra sem enviar;
 * - uma assinatura 410 (ou 404) entre 3: as outras recebem e ganham `ultimo_envio_em`; a revogada sai do banco
 *   (NOT-29, NOT-30); 400, 403 e 413 mantêm a assinatura, e o cliente de envio já reportou só o host e o status;
 * - queda no meio do lote (exceção): o que já foi aceito é gravado antes de a exceção subir, e a nova entrega da fila
 *   não reenvia a essas (`desde = criadoEm`, NOT-69).
 *
 * SPEC_DEVIATION (plano B da S-01, AD-104): o plano não vem do `recursoLiberado` da planos-e-cobranca, que devolve
 * `false` para grupo que o contexto não enxerga, e o consumidor roda sem conta nem slug. A `push_envio_grupo` devolve
 * as entradas do plano e a decisão é a do domínio (`planoEfetivo` + `planoLibera`, a mesma tabela do `recursoLiberado`),
 * com o "hoje" de São Paulo do instante do envio.
 */

export interface OpcoesEnviarRanking {
  /** Só para os testes: o serviço de push falso (NOT-63). */
  fetch?: typeof fetch;
  /** Só para os testes: troca o relato ao Sentry do cliente de envio. */
  reportar?: Reportar;
  /** Só para os testes: o instante do envio (padrão: o relógio do sistema). */
  agora?: () => Date;
}

const CONCLUIR: Desfecho = { acao: 'concluir' };

export function criarEnviarRanking(opcoes: OpcoesEnviarRanking = {}): CasoDeUso<MensagemRanking> {
  return async (mensagem, { env, banco }) => {
    const vapid = chavesVapidDoAmbiente(env);
    if (vapid === null) return CONCLUIR;

    const agora = opcoes.agora?.() ?? new Date();
    const hoje = dataEmSaoPaulo(agora) as Data;
    const { grupoId } = mensagem;

    const preparo = await banco(async (db) => {
      const grupo = await push.envioGrupo(db, grupoId);
      if (grupo === null || grupo.arquivado) return null;
      const plano = planoEfetivo(grupo.situacaoComercial, grupo.trialInicio, grupo.pagoAte, hoje);
      if (!planoLibera(plano, 'push')) return null;
      const lote = await push.loteRanking(db, grupoId, mensagem.aposId, LOTE_MAXIMO, mensagem.criadoEm);
      return { grupo, lote };
    });
    if (preparo === null || preparo.lote.length === 0) return CONCLUIR;

    const payload = serializarPayload(
      payloadRanking({ nomeGrupo: preparo.grupo.nome, slug: preparo.grupo.slug, dataPartida: mensagem.dataPartida as Data }),
    );
    const topico = await topicoDoGrupo(grupoId);
    const cache = novoCacheVapid();
    const aceitos: string[] = [];
    const revogados: string[] = [];

    try {
      for (const assinatura of preparo.lote) {
        const resultado = await enviarPush(assinatura, payload, {
          vapid,
          topico,
          ttl: TTL_RANKING,
          agora,
          cache,
          ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}),
          ...(opcoes.reportar ? { reportar: opcoes.reportar } : {}),
        });
        if (resultado.classe === 'aceito') aceitos.push(assinatura.id);
        else if (resultado.classe === 'revogada') revogados.push(assinatura.id);
        // `tentarDeNovo` (429, 5xx, rede): a nova tentativa é da T19. `erro`: mantém a assinatura.
      }
    } finally {
      // Grava o que já aconteceu mesmo se o laço cair no meio: a nova entrega não reenvia às aceitas (NOT-69).
      if (aceitos.length > 0 || revogados.length > 0) {
        await banco((db) => push.resultadoRanking(db, grupoId, aceitos, revogados));
      }
    }
    return CONCLUIR;
  };
}

export const enviarRanking = criarEnviarRanking();
