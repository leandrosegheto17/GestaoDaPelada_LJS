import type { AlvoDeEventos } from './servico.ts';

/**
 * Troca da assinatura pelo navegador (notificacoes T35; NOT-19, NOT-70). O navegador dispara `pushsubscriptionchange`
 * quando invalida a assinatura (chave rodada, expiração): a antiga deixa de valer no servidor e a nova precisa ser
 * gravada nos mesmos destinos.
 *
 * Uma registração de SW tem um único `PushSubscription`, então o mesmo endpoint serve a vários grupos (NOT-70, uma
 * linha por grupo no servidor) e à conta (avisos de cobrança, T38). Os destinos de cada endpoint ficam no IndexedDB da
 * origem, gravados pelo front na hora de assinar (`frontend/web/src/push/assinatura.ts`, T36); o SW lê a mesma base.
 *
 * Casos limite, listados antes do código:
 * - antiga e nova: para cada destino guardado da antiga, `DELETE` com o endpoint e o `auth` dela e `POST` com a nova,
 *   no mesmo destino; depois, os destinos passam para o endpoint novo;
 * - sem a nova (o navegador às vezes não entrega uma): só o `DELETE`, e os destinos da antiga são apagados;
 * - sem a antiga, ou sem destino guardado para ela: nenhum `fetch`;
 * - cada pedido leva `X-Pelada: 1` e `Content-Type: application/json`; o da conta vai com o cookie da sessão
 *   (`credentials: 'same-origin'`);
 * - um destino que falha (rede, 4xx, 5xx) não impede os outros; o destino só passa para o endpoint novo se o `POST`
 *   respondeu 2xx (senão, na próxima vez que o front ler o estado, ele volta a "Receber avisos", NOT-71).
 */

export type Destino = { tipo: 'ranking'; slug: string } | { tipo: 'conta' };

/** Onde os destinos de cada endpoint ficam guardados (IndexedDB no navegador, memória nos testes). */
export interface GuardaDestinos {
  ler(endpoint: string): Promise<Destino[]>;
  gravar(endpoint: string, destinos: readonly Destino[]): Promise<void>;
  apagar(endpoint: string): Promise<void>;
}

const mesmoDestino = (a: Destino, b: Destino): boolean =>
  a.tipo === b.tipo && (a.tipo === 'conta' || (b.tipo === 'ranking' && a.slug === b.slug));

/** Acrescenta o destino ao endpoint, sem repetir (T36, ao assinar). */
export async function adicionarDestino(
  guarda: GuardaDestinos,
  endpoint: string,
  destino: Destino,
): Promise<void> {
  const atuais = await guarda.ler(endpoint);
  if (atuais.some((d) => mesmoDestino(d, destino))) return;
  await guarda.gravar(endpoint, [...atuais, destino]);
}

/** Tira o destino do endpoint (T36, ao cancelar); sem destino nenhum, apaga a entrada. */
export async function removerDestino(
  guarda: GuardaDestinos,
  endpoint: string,
  destino: Destino,
): Promise<void> {
  const restantes = (await guarda.ler(endpoint)).filter((d) => !mesmoDestino(d, destino));
  if (restantes.length === 0) await guarda.apagar(endpoint);
  else await guarda.gravar(endpoint, restantes);
}

/** O caminho da API de cada destino. */
export function caminhoDoDestino(destino: Destino): string {
  return destino.tipo === 'conta'
    ? '/api/conta/push'
    : `/api/publico/${encodeURIComponent(destino.slug)}/push`;
}

/** A forma do `PushSubscription.toJSON()` que interessa. */
export interface AssinaturaJson {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export interface AssinaturaDoNavegador {
  toJSON(): AssinaturaJson;
}

export interface DependenciasTroca {
  guarda: GuardaDestinos;
  buscar: (url: string, init: RequestInit) => Promise<Response>;
}

const CABECALHOS = { 'Content-Type': 'application/json', 'X-Pelada': '1' } as const;

async function pedir(
  deps: DependenciasTroca,
  destino: Destino,
  metodo: 'POST' | 'DELETE',
  corpo: unknown,
): Promise<boolean> {
  try {
    const r = await deps.buscar(caminhoDoDestino(destino), {
      method: metodo,
      headers: CABECALHOS,
      credentials: 'same-origin',
      body: JSON.stringify(corpo),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** O trabalho do `pushsubscriptionchange` (NOT-19). */
export async function trocarAssinatura(
  antiga: AssinaturaDoNavegador | null | undefined,
  nova: AssinaturaDoNavegador | null | undefined,
  deps: DependenciasTroca,
): Promise<void> {
  const velha = antiga?.toJSON();
  const endpointVelho = velha?.endpoint;
  if (!endpointVelho) return;
  const destinos = await deps.guarda.ler(endpointVelho);
  if (destinos.length === 0) return;

  const novaJson = nova?.toJSON();
  const corpoNovo =
    novaJson?.endpoint && novaJson.keys?.p256dh && novaJson.keys.auth
      ? {
          endpoint: novaJson.endpoint,
          chaves: { p256dh: novaJson.keys.p256dh, auth: novaJson.keys.auth },
        }
      : null;

  const passaram: Destino[] = [];
  for (const destino of destinos) {
    if (velha?.keys?.auth)
      await pedir(deps, destino, 'DELETE', {
        endpoint: endpointVelho,
        chaves: { auth: velha.keys.auth },
      });
    if (corpoNovo && (await pedir(deps, destino, 'POST', corpoNovo))) passaram.push(destino);
  }

  await deps.guarda.apagar(endpointVelho);
  if (corpoNovo && passaram.length > 0) {
    for (const d of passaram) await adicionarDestino(deps.guarda, corpoNovo.endpoint, d);
  }
}

interface EventoTroca {
  waitUntil(promessa: Promise<unknown>): void;
  oldSubscription?: AssinaturaDoNavegador | null;
  newSubscription?: AssinaturaDoNavegador | null;
}

/** Liga o `pushsubscriptionchange` (chamado pelo `sw.ts`; fora do `registrarEventos` do FUN-34). */
export function registrarTrocaDeAssinatura(alvo: AlvoDeEventos, deps: DependenciasTroca): void {
  alvo.addEventListener('pushsubscriptionchange', (evento) => {
    const e = evento as Partial<EventoTroca> | undefined;
    if (!e || typeof e.waitUntil !== 'function') return;
    e.waitUntil(trocarAssinatura(e.oldSubscription, e.newSubscription, deps));
  });
}

// ---------------------------------------------------------------- IndexedDB

const BASE = 'pelada-push';
const LOJA = 'destinos';

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(LOJA)) pedido.result.createObjectStore(LOJA);
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

async function naLoja<T>(
  modo: IDBTransactionMode,
  fazer: (loja: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const base = await abrirBase();
  try {
    return await new Promise<T>((resolver, rejeitar) => {
      const tx = base.transaction(LOJA, modo);
      const pedido = fazer(tx.objectStore(LOJA));
      tx.oncomplete = () => resolver(pedido.result as T);
      tx.onerror = () => rejeitar(tx.error);
      tx.onabort = () => rejeitar(tx.error);
    });
  } finally {
    base.close();
  }
}

const ehDestino = (d: unknown): d is Destino => {
  if (typeof d !== 'object' || d === null) return false;
  const x = d as { tipo?: unknown; slug?: unknown };
  return x.tipo === 'conta' || (x.tipo === 'ranking' && typeof x.slug === 'string');
};

/** A guarda do navegador: uma entrada por endpoint, com a lista de destinos. */
export function guardaIndexedDb(): GuardaDestinos {
  return {
    ler: async (endpoint) => {
      const valor = await naLoja<unknown>('readonly', (l) => l.get(endpoint));
      return Array.isArray(valor) ? valor.filter(ehDestino) : [];
    },
    gravar: async (endpoint, destinos) => {
      await naLoja('readwrite', (l) => l.put([...destinos], endpoint));
    },
    apagar: async (endpoint) => {
      await naLoja('readwrite', (l) => l.delete(endpoint));
    },
  };
}

/** A guarda em memória dos testes. */
export function guardaMemoria(): GuardaDestinos & { entradas: Map<string, Destino[]> } {
  const entradas = new Map<string, Destino[]>();
  return {
    entradas,
    ler: async (endpoint) => [...(entradas.get(endpoint) ?? [])],
    gravar: async (endpoint, destinos) => {
      entradas.set(endpoint, [...destinos]);
    },
    apagar: async (endpoint) => {
      entradas.delete(endpoint);
    },
  };
}
