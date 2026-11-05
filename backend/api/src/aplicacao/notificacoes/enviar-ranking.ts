import { LOTE_MAXIMO, TENTATIVA_MAXIMA, type MensagemRanking } from '@pelada/contrato/fila-avisos';
import { hostsPushDev } from '@pelada/contrato/push';
import { payloadRanking, planoEfetivo, planoLibera, serializarPayload, type Data } from '@pelada/dominio';
import type { CasoDeUso, Desfecho } from '../../entrada/consumidor-avisos.ts';
import { push, type AssinaturaDoLote } from '../../infraestrutura/db/repositorios/push.ts';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';
import { agendarAviso } from '../../infraestrutura/fila/avisos.ts';
import { enviarPush, TTL_RANKING, type Reportar } from '../../infraestrutura/push/enviar.ts';
import { topicoDoGrupo } from '../../infraestrutura/push/topico.ts';
import { chavesVapidDoAmbiente, novoCacheVapid } from '../../infraestrutura/push/vapid.ts';
import { dataEmSaoPaulo } from '../../infraestrutura/relogio.ts';

/**
 * Envio do aviso de ranking atualizado (notificacoes T18 e T19; NOT-24, NOT-29, NOT-30, NOT-31, NOT-61, NOT-68, NOT-69;
 * AD-049, AD-070, AD-108), o caso de uso `ranking` do consumidor da fila (T17).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - sem as três variáveis VAPID: encerra sem abrir o banco e sem nenhum `fetch` (NOT-61);
 * - grupo que não existe mais ou arquivado: encerra sem enviar (NOT-24);
 * - plano no momento do envio, não no do commit (NOT-24, NOT-68): `trial` vigente, `pro` e `cortesia` enviam; `free`
 *   (inclusive o trial vencido e o grupo que caiu para Free entre o commit e o envio) encerra sem enviar;
 * - grupo sem assinatura pendente (nenhuma, ou todas já com envio aceito desde `criadoEm`): encerra sem enviar;
 * - uma assinatura 410 (ou 404) entre 3: as outras recebem e ganham `ultimo_envio_em`; a revogada sai do banco
 *   (NOT-29, NOT-30); 400, 403 e 413 mantêm a assinatura, e o cliente de envio já reportou só o host e o status;
 * - 41 assinaturas: 40 nesta invocação e a continuação enfileirada a partir do id da 40.ª; 80: duas invocações, e a
 *   segunda não enfileira continuação vazia (o lote lê 41 para saber se há mais) (T19, NOT-34);
 * - 429 ou 5xx (ou rede): as assinaturas vão numa mensagem só com os `ids`, `tentativa` + 1 e o atraso do maior
 *   `Retry-After` (padrão 60 s, teto 1 h); na tentativa 3 desiste daquele aviso sem apagar a assinatura (T19, NOT-31);
 * - a mensagem de nova tentativa reenvia só às dos `ids` que ainda não têm envio aceito desde `criadoEm`;
 * - queda no meio do lote (exceção): o que já foi aceito é gravado antes de a exceção subir, e a nova entrega da fila
 *   não reenvia a essas (`desde = criadoEm`, NOT-69): depois de 10 aceitas, a refeita manda só às 30 restantes.
 *
 * SPEC_DEVIATION (plano B da S-01, AD-104): o plano não vem do `recursoLiberado` da planos-e-cobranca, que devolve
 * `false` para grupo que o contexto não enxerga, e o consumidor roda sem conta nem slug. A `push_envio_grupo` devolve
 * as entradas do plano e a decisão é a do domínio (`planoEfetivo` + `planoLibera`, a mesma tabela do `recursoLiberado`),
 * com o "hoje" de São Paulo do instante do envio.
 */

/** Atraso de uma nova tentativa sem `Retry-After` (T19). */
export const ATRASO_PADRAO_S = 60;
/** Teto do atraso de uma nova tentativa (T19). */
export const ATRASO_TETO_S = 3600;

export interface OpcoesEnviarRanking {
  /** Só para os testes: o serviço de push falso (NOT-63). */
  fetch?: typeof fetch;
  /** Só para os testes: troca o relato ao Sentry do cliente de envio. */
  reportar?: Reportar;
  /** Só para os testes: o instante do envio (padrão: o relógio do sistema). */
  agora?: () => Date;
}

const CONCLUIR: Desfecho = { acao: 'concluir' };

const comparaId = (a: string, b: string): number => {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

interface Pendentes {
  lote: AssinaturaDoLote[];
  /** Id da última enviada, quando há mais assinaturas depois dela (continuação). */
  continuarApos?: string;
}

/**
 * As assinaturas desta invocação. Mensagem de nova tentativa: só as dos `ids` sem envio aceito desde `criadoEm`, lidas
 * em páginas de 40 a partir do menor id (o grupo tem no máximo 200, NOT-10). Senão: até 40 a partir de `aposId`, lendo
 * uma a mais para saber se há continuação.
 */
async function lerPendentes(db: Db, mensagem: MensagemRanking): Promise<Pendentes> {
  const { grupoId, criadoEm } = mensagem;
  if (mensagem.ids !== undefined) {
    const alvo = new Set(mensagem.ids);
    const ordenados = [...mensagem.ids].sort(comparaId);
    const maior = ordenados[ordenados.length - 1] as string;
    let apos = (BigInt(ordenados[0] as string) - 1n).toString();
    const achadas: AssinaturaDoLote[] = [];
    for (;;) {
      const pagina = await push.loteRanking(db, grupoId, apos, LOTE_MAXIMO, criadoEm);
      for (const a of pagina) if (alvo.has(a.id)) achadas.push(a);
      const ultimo = pagina[pagina.length - 1];
      if (pagina.length < LOTE_MAXIMO || ultimo === undefined || comparaId(ultimo.id, maior) >= 0) break;
      apos = ultimo.id;
    }
    return { lote: achadas };
  }
  const lidas = await push.loteRanking(db, grupoId, mensagem.aposId, LOTE_MAXIMO + 1, criadoEm);
  if (lidas.length <= LOTE_MAXIMO) return { lote: lidas };
  const lote = lidas.slice(0, LOTE_MAXIMO);
  return { lote, continuarApos: (lote[lote.length - 1] as AssinaturaDoLote).id };
}

/** O maior `Retry-After` pedido; sem nenhum, o padrão; nunca acima do teto. Também o do push de cobrança (T25). */
export function atrasoDaNovaTentativa(pedidos: ReadonlyArray<number | undefined>): number {
  const informados = pedidos.filter((s): s is number => s !== undefined);
  const atraso = informados.length === 0 ? ATRASO_PADRAO_S : Math.max(...informados);
  return Math.min(Math.max(0, atraso), ATRASO_TETO_S);
}

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
      return { grupo, ...(await lerPendentes(db, mensagem)) };
    });
    if (preparo === null || preparo.lote.length === 0) return CONCLUIR;

    const payload = serializarPayload(
      payloadRanking({ nomeGrupo: preparo.grupo.nome, slug: preparo.grupo.slug, dataPartida: mensagem.dataPartida as Data }),
    );
    const topico = await topicoDoGrupo(grupoId);
    const cache = novoCacheVapid();
    const hostsExtras = hostsPushDev(env.PUSH_HOSTS_DEV);
    const aceitos: string[] = [];
    const revogados: string[] = [];
    const deNovo: string[] = [];
    const atrasos: Array<number | undefined> = [];

    try {
      for (const assinatura of preparo.lote) {
        const resultado = await enviarPush(assinatura, payload, {
          vapid,
          topico,
          ttl: TTL_RANKING,
          agora,
          cache,
          hostsExtras,
          ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}),
          ...(opcoes.reportar ? { reportar: opcoes.reportar } : {}),
        });
        if (resultado.classe === 'aceito') aceitos.push(assinatura.id);
        else if (resultado.classe === 'revogada') revogados.push(assinatura.id);
        else if (resultado.classe === 'tentarDeNovo') {
          deNovo.push(assinatura.id);
          atrasos.push(resultado.aposSegundos);
        }
        // `erro` (400, 403, 413 e os demais): mantém a assinatura, sem nova tentativa.
      }
    } finally {
      // Grava o que já aconteceu mesmo se o laço cair no meio: a nova entrega não reenvia às aceitas (NOT-69).
      if (aceitos.length > 0 || revogados.length > 0) {
        await banco((db) => push.resultadoRanking(db, grupoId, aceitos, revogados));
      }
    }

    // Só depois de gravar: uma falha ao enfileirar faz a fila entregar esta de novo, que não reenvia às aceitas.
    if (preparo.continuarApos !== undefined) {
      await agendarAviso(env, { ...mensagem, aposId: preparo.continuarApos });
    }
    if (deNovo.length > 0 && mensagem.tentativa < TENTATIVA_MAXIMA) {
      await agendarAviso(
        env,
        {
          tipo: 'ranking',
          grupoId,
          dataPartida: mensagem.dataPartida,
          criadoEm: mensagem.criadoEm,
          aposId: '0',
          ids: deNovo,
          tentativa: mensagem.tentativa + 1,
        },
        { aposSegundos: atrasoDaNovaTentativa(atrasos) },
      );
    }
    // Na tentativa 3, as que ainda pedem nova tentativa ficam sem este aviso; a assinatura continua (NOT-31).
    return CONCLUIR;
  };
}

export const enviarRanking = criarEnviarRanking();
