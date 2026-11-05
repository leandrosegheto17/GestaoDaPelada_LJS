import { TITULO_RANKING } from '@pelada/dominio';

/**
 * Notificações do service worker (notificacoes T34; NOT-35, NOT-36, NOT-37, NOT-48, NOT-66; AD-110). Regras puras,
 * testadas sem `ServiceWorkerGlobalScope`; o `servico.ts` as liga aos eventos `push` e `notificationclick`.
 *
 * Casos limite, listados antes do código:
 * - payload JSON com `titulo` e `caminho` (e `texto` no ranking): mostra com título, texto, ícone do app e `tag`;
 * - `tag` (AD-110): no ranking, o slug do caminho `/g/<slug>`; na cobrança, `cobranca-<grupoId>` do caminho
 *   `/app/grupos/<id>/plano`. Dois `push` do mesmo grupo dão a mesma `tag` e o navegador troca a anterior (NOT-66);
 * - payload que não é JSON, JSON sem `titulo` ou `caminho` em texto, ou caminho que não casa com o tipo: a notificação
 *   genérica "Ranking atualizado", nunca nenhuma (NOT-36). O navegador exige uma notificação por push com
 *   `userVisibleOnly`;
 * - evento sem `waitUntil` ou sem dado (o teste FUN-34 chama o handler com `{}`): não lança;
 * - clique (NOT-37, NOT-48): fecha a notificação; o destino só vale se for caminho relativo da mesma origem que começa
 *   com `/g/` (push do ranking) ou `/app/` (push da cobrança), sem `//`, sem `\`, sem `..` e igual depois de normalizado
 *   pelo `URL`; qualquer outro (`//mal.example`, `https://mal.example/g/x`, `/g/../x`, `javascript:`, `/app/` vindo do
 *   ranking) abre `/`;
 * - com uma janela da mesma origem já no destino, foca nela; senão, abre o destino.
 */

export const ICONE_NOTIFICACAO = '/icones/icone-192.png';
export const TAG_GENERICA = 'ranking';
const CAMINHO_PADRAO = '/';

export type TipoNotificacao = 'ranking' | 'cobranca' | 'generico';

/** O que vai no `data` da notificação, para o clique saber o destino e o tipo. */
export interface DadosNotificacao {
  caminho: string;
  tipo: TipoNotificacao;
}

export interface OpcoesNotificacao {
  body?: string;
  icon: string;
  badge: string;
  tag: string;
  data: DadosNotificacao;
}

export interface NotificacaoMontada {
  titulo: string;
  opcoes: OpcoesNotificacao;
}

const RANKING = /^\/g\/([a-z0-9-]{1,64})(?:\?mes=\d{4}-\d{2})?$/;
const COBRANCA = /^\/app\/grupos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/plano$/;

function opcoes(tag: string, dados: DadosNotificacao, texto?: string): OpcoesNotificacao {
  return {
    ...(texto !== undefined ? { body: texto } : {}),
    icon: ICONE_NOTIFICACAO,
    badge: ICONE_NOTIFICACAO,
    tag,
    data: dados,
  };
}

export const NOTIFICACAO_GENERICA: NotificacaoMontada = {
  titulo: TITULO_RANKING,
  opcoes: opcoes(TAG_GENERICA, { caminho: CAMINHO_PADRAO, tipo: 'generico' }),
};

/** O payload decifrado pelo navegador (texto) vira a notificação; ilegível vira a genérica (NOT-36). */
export function montarNotificacao(texto: string | null | undefined): NotificacaoMontada {
  if (typeof texto !== 'string') return NOTIFICACAO_GENERICA;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return NOTIFICACAO_GENERICA;
  }
  if (typeof bruto !== 'object' || bruto === null) return NOTIFICACAO_GENERICA;
  const { titulo, texto: corpo, caminho } = bruto as Record<string, unknown>;
  if (typeof titulo !== 'string' || titulo.trim() === '' || typeof caminho !== 'string')
    return NOTIFICACAO_GENERICA;
  if (corpo !== undefined && typeof corpo !== 'string') return NOTIFICACAO_GENERICA;

  const ranking = RANKING.exec(caminho);
  if (ranking && titulo === TITULO_RANKING)
    return { titulo, opcoes: opcoes(ranking[1]!, { caminho, tipo: 'ranking' }, corpo) };
  const cobranca = COBRANCA.exec(caminho);
  if (cobranca && titulo !== TITULO_RANKING)
    return {
      titulo,
      opcoes: opcoes(`cobranca-${cobranca[1]!}`, { caminho, tipo: 'cobranca' }, corpo),
    };
  return NOTIFICACAO_GENERICA;
}

const PREFIXO: Readonly<Record<TipoNotificacao, string | null>> = {
  ranking: '/g/',
  cobranca: '/app/',
  generico: null,
};

/** O destino do clique (NOT-37, NOT-48): só caminho relativo da mesma origem e do prefixo do tipo; senão, `/`. */
export function destinoDoClique(dados: unknown, origem: string): string {
  if (typeof dados !== 'object' || dados === null) return CAMINHO_PADRAO;
  const { caminho, tipo } = dados as Partial<DadosNotificacao>;
  if (typeof caminho !== 'string' || typeof tipo !== 'string') return CAMINHO_PADRAO;
  const prefixo = PREFIXO[tipo as TipoNotificacao];
  if (!prefixo) return CAMINHO_PADRAO;
  if (!caminho.startsWith(prefixo) || caminho.includes('//') || caminho.includes('\\'))
    return CAMINHO_PADRAO;
  if (caminho.split(/[?#]/)[0]!.split('/').some((s) => s === '..' || s === '.'))
    return CAMINHO_PADRAO;
  let url: URL;
  try {
    url = new URL(caminho, origem);
  } catch {
    return CAMINHO_PADRAO;
  }
  if (url.origin !== origem || `${url.pathname}${url.search}` !== caminho) return CAMINHO_PADRAO;
  return caminho;
}

// ---------------------------------------------------------------- eventos

/** Partes do `ServiceWorkerGlobalScope` que as notificações usam (tipos mínimos, como no `sw.ts`). */
export interface JanelaCliente {
  url: string;
  focus(): Promise<unknown>;
}

export interface EscopoNotificacoes {
  registration: {
    showNotification(titulo: string, opcoes: OpcoesNotificacao): Promise<void>;
  };
  clients: {
    matchAll(opcoes: { type: 'window'; includeUncontrolled: boolean }): Promise<JanelaCliente[]>;
    openWindow(url: string): Promise<unknown>;
  };
  location: { origin: string };
}

interface EventoComEspera {
  waitUntil(promessa: Promise<unknown>): void;
}

function comEspera(evento: unknown): evento is EventoComEspera {
  return (
    typeof evento === 'object' &&
    evento !== null &&
    typeof (evento as Partial<EventoComEspera>).waitUntil === 'function'
  );
}

/** O texto do `PushMessageData`; qualquer falha ao ler vira `null` (notificação genérica). */
function textoDoPush(evento: unknown): string | null {
  const dados = (evento as { data?: { text?: () => string } | null }).data;
  if (!dados || typeof dados.text !== 'function') return null;
  try {
    return dados.text();
  } catch {
    return null;
  }
}

/** `push` (NOT-35, NOT-36, NOT-66): sempre mostra uma notificação. */
export function tratarPush(evento: unknown, escopo: EscopoNotificacoes | undefined): void {
  if (!comEspera(evento) || !escopo) return;
  const n = montarNotificacao(textoDoPush(evento));
  evento.waitUntil(escopo.registration.showNotification(n.titulo, n.opcoes));
}

/** `notificationclick` (NOT-37, NOT-48): fecha, foca a janela já no destino ou abre o destino. */
export function tratarClique(evento: unknown, escopo: EscopoNotificacoes | undefined): void {
  if (!comEspera(evento) || !escopo) return;
  const notificacao = (evento as { notification?: { close?: () => void; data?: unknown } })
    .notification;
  notificacao?.close?.();
  const origem = escopo.location.origin;
  const destino = destinoDoClique(notificacao?.data, origem);
  evento.waitUntil(
    (async () => {
      const janelas = await escopo.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const alvo = new URL(destino, origem).href;
      const aberta = janelas.find((j) => j.url === alvo);
      if (aberta) {
        await aberta.focus();
        return;
      }
      await escopo.clients.openWindow(destino);
    })(),
  );
}
