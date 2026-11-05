import * as Sentry from '@sentry/cloudflare';
import { endpointPushAceito } from '@pelada/contrato/push';
import { cifrarPayload, ErroChaveAssinante, ErroPayloadGrande } from './cifra.ts';
import { cabecalhoVapid, novoCacheVapid, type CacheVapid, type ChavesVapid } from './vapid.ts';

/**
 * Cliente de envio Web Push (T6; NOT-27 a NOT-33, NOT-63). Cifra (T2), assina (T3) e faz um `POST` ao `endpoint`,
 * e classifica a resposta do serviço de push. Quem chama decide o que fazer com cada classe (T18, T19, T25).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 201: `aceito` (RFC 8030 §5: aceito, não entregue).
 * - 404 e 410: `revogada` (§7.3), a assinatura sai do banco.
 * - 429 e 5xx: `tentarDeNovo`, com o `Retry-After` em segundos, venha ele em segundos ou em data HTTP; data no
 *   passado vira 0; valor ilegível fica sem atraso (quem chama usa o padrão de 60 s, T19).
 * - 400, 403 e 413: `erro`, mantém a assinatura e reporta ao Sentry só o host e o status (NOT-32).
 * - [LACUNA] Os demais status (200, 202, 3xx, 401, outros 4xx) a spec não define: aqui viram `erro`, reportado como o
 *   400 (mantém a assinatura, não marca envio aceito). Interpretação conservadora; o /executar confirma.
 * - [LACUNA] `fetch` que lança (rede) ou passa de 10 s: a spec não define; aqui vira `tentarDeNovo` sem atraso,
 *   que tem o mesmo teto de 2 novas tentativas do 5xx e não apaga a assinatura.
 * - Host fora da lista de T1 (conferido de novo, contra SSRF): `erro` sem chamar o `fetch`, reportado sem o host.
 * - Payload grande ou chave do assinante inválida: `erro` sem chamar o `fetch`.
 * Nunca vão para log nem para o Sentry: o `endpoint` (só o host dele), o `p256dh`, o `auth` e o payload (NOT-33).
 */

export const TTL_RANKING = 86_400;
export const TTL_COBRANCA = 172_800;
export const TEMPO_LIMITE_PUSH_MS = 10_000;

export interface AssinaturaParaEnvio {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type ResultadoPush =
  | { classe: 'aceito' }
  | { classe: 'revogada' }
  | { classe: 'tentarDeNovo'; aposSegundos?: number }
  | { classe: 'erro' };

/** O que vai ao Sentry: nada além do host do serviço, do status e de um motivo fixo. */
export interface RelatoPush {
  host: string;
  status: number;
  motivo: 'status' | 'host_fora_da_lista' | 'payload_grande' | 'chave_invalida';
}

export type Reportar = (relato: RelatoPush) => void;

const reportarPadrao: Reportar = (relato) => {
  Sentry.captureMessage('push_erro', {
    level: 'warning',
    tags: {
      push_host: relato.host,
      push_status: String(relato.status),
      push_motivo: relato.motivo,
    },
  });
};

export interface OpcoesEnvio {
  vapid: ChavesVapid;
  topico: string;
  /** `TTL_RANKING` ou `TTL_COBRANCA`. */
  ttl: number;
  agora?: Date;
  cache?: CacheVapid;
  /** `PUSH_HOSTS_DEV`, só no ambiente local (T27). */
  hostsExtras?: readonly string[];
  fetch?: typeof fetch;
  reportar?: Reportar;
  tempoLimiteMs?: number;
}

/** `Retry-After` em segundos (inteiro) ou em data HTTP (RFC 9110 §10.2.3). */
export function segundosDoRetryAfter(valor: string | null, agora: Date): number | undefined {
  if (valor === null) return undefined;
  const texto = valor.trim();
  if (/^\d+$/.test(texto)) return Number(texto);
  if (!/[A-Za-z]/.test(texto)) return undefined;
  const momento = Date.parse(texto);
  if (Number.isNaN(momento)) return undefined;
  return Math.max(0, Math.ceil((momento - agora.getTime()) / 1000));
}

function classificar(resposta: Response, agora: Date): ResultadoPush {
  const s = resposta.status;
  if (s === 201) return { classe: 'aceito' };
  if (s === 404 || s === 410) return { classe: 'revogada' };
  if (s === 429 || (s >= 500 && s <= 599)) {
    const aposSegundos = segundosDoRetryAfter(resposta.headers.get('retry-after'), agora);
    return aposSegundos === undefined
      ? { classe: 'tentarDeNovo' }
      : { classe: 'tentarDeNovo', aposSegundos };
  }
  return { classe: 'erro' };
}

export async function enviarPush(
  assinatura: AssinaturaParaEnvio,
  payload: string,
  opcoes: OpcoesEnvio,
): Promise<ResultadoPush> {
  const reportar = opcoes.reportar ?? reportarPadrao;
  const buscar = opcoes.fetch ?? fetch;
  const agora = opcoes.agora ?? new Date();

  if (!endpointPushAceito(assinatura.endpoint, opcoes.hostsExtras)) {
    reportar({ host: '', status: 0, motivo: 'host_fora_da_lista' });
    return { classe: 'erro' };
  }
  const host = new URL(assinatura.endpoint).hostname;

  let corpo: Uint8Array<ArrayBuffer>;
  try {
    corpo = await cifrarPayload(payload, { p256dh: assinatura.p256dh, auth: assinatura.auth });
  } catch (erro) {
    if (erro instanceof ErroPayloadGrande) reportar({ host, status: 0, motivo: 'payload_grande' });
    else if (erro instanceof ErroChaveAssinante)
      reportar({ host, status: 0, motivo: 'chave_invalida' });
    else throw erro;
    return { classe: 'erro' };
  }

  const autorizacao = await cabecalhoVapid(
    assinatura.endpoint,
    opcoes.vapid,
    agora,
    opcoes.cache ?? novoCacheVapid(),
  );

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PUSH_MS);
  let resposta: Response;
  try {
    resposta = await buscar(assinatura.endpoint, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(opcoes.ttl),
        Urgency: 'normal',
        Topic: opcoes.topico,
        Authorization: autorizacao,
      },
      body: corpo,
      signal: controle.signal,
    });
  } catch {
    return { classe: 'tentarDeNovo' };
  } finally {
    clearTimeout(relogio);
  }

  const resultado = classificar(resposta, agora);
  if (resultado.classe === 'erro') reportar({ host, status: resposta.status, motivo: 'status' });
  // O corpo da resposta não é lido: pode ecoar o endpoint.
  await resposta.body?.cancel();
  return resultado;
}

/** Serviço de push falso dos testes (NOT-63): guarda cada pedido e responde com o status da fila de respostas. */
export interface PedidoRecebido {
  url: string;
  cabecalhos: Headers;
  corpo: Uint8Array;
}

export interface ServicoPushFalso {
  fetch: typeof fetch;
  readonly pedidos: PedidoRecebido[];
  /** Próximas respostas, na ordem; acabou a fila, responde 201. */
  responder(
    ...respostas: Array<number | { status: number; cabecalhos?: Record<string, string> }>
  ): void;
}

export function servicoPushFalso(): ServicoPushFalso {
  const pedidos: PedidoRecebido[] = [];
  const fila: Array<{ status: number; cabecalhos?: Record<string, string> }> = [];
  const falso = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requisicao = new Request(entrada, init);
    pedidos.push({
      url: requisicao.url,
      cabecalhos: requisicao.headers,
      corpo: new Uint8Array(await requisicao.arrayBuffer()),
    });
    const r = fila.shift() ?? { status: 201 };
    return new Response(null, { status: r.status, headers: r.cabecalhos ?? {} });
  };
  return {
    fetch: falso as typeof fetch,
    pedidos,
    responder(...respostas) {
      for (const r of respostas) fila.push(typeof r === 'number' ? { status: r } : r);
    },
  };
}
