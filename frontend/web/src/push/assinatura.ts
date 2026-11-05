import { deBase64url } from '@pelada/contrato/push';
import type { ClienteApi } from '../dados/cliente.ts';
import {
  adicionarDestino,
  caminhoDoDestino,
  guardaIndexedDb,
  removerDestino,
  type Destino,
  type GuardaDestinos,
} from '../pwa/sw-assinatura.ts';

/**
 * Assinatura de push no front (notificacoes T36; NOT-02, NOT-04, NOT-16, NOT-62, NOT-70). Serve ao controle do ranking
 * (destino `ranking` com o slug, T37) e aos avisos de cobrança em Minha conta (destino `conta`, T38).
 *
 * Estados: `sem_suporte` (falta `PushManager`, `serviceWorker` ou `Notification`), `desligado` (permissão negada ou
 * fechada sem resposta), `nao_assinado`, `assinado`.
 *
 * Casos limite, listados antes do código:
 * - a permissão só é pedida dentro de `assinar` (que a tela chama no toque), nunca ao importar nem no `estado` (NOT-02);
 * - permissão negada ou fechada: `desligado`, sem `fetch` nem `subscribe` (NOT-04);
 * - `subscribe` com `userVisibleOnly: true` e a chave pública VAPID em bytes (NOT-02);
 * - uma registração tem um único `PushSubscription`: assinar um segundo grupo reaproveita a assinatura local (NOT-70) e
 *   só grava o destino a mais no servidor e no IndexedDB;
 * - cancelar faz o `DELETE` com o `endpoint` e o `auth` e tira o destino; o `unsubscribe()` só quando não sobra destino
 *   nenhum no aparelho, para não derrubar os outros grupos (NOT-16, NOT-70);
 * - troca da chave VAPID (NOT-62): assinatura local com outra `applicationServerKey` é cancelada (`unsubscribe` e os
 *   destinos guardados apagados) e o estado volta a `nao_assinado`; ao assinar, o mesmo antes do `subscribe`;
 * - `estado` com a permissão concedida e a assinatura local pergunta ao servidor (`POST …/estado`): sem a linha lá,
 *   `nao_assinado` (NOT-71).
 */

export type EstadoPushLocal = 'sem_suporte' | 'desligado' | 'nao_assinado' | 'assinado';

/** Partes do `PushSubscription` usadas aqui. */
export interface AssinaturaLocal {
  readonly options?: { applicationServerKey?: ArrayBuffer | null };
  toJSON(): { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  unsubscribe(): Promise<boolean>;
}

export interface GerentePush {
  getSubscription(): Promise<AssinaturaLocal | null>;
  subscribe(opcoes: {
    userVisibleOnly: true;
    applicationServerKey: Uint8Array;
  }): Promise<AssinaturaLocal>;
}

/** O que o navegador oferece; nos testes, dublês. */
export interface NavegadorPush {
  suporta: boolean;
  permissao(): NotificationPermission;
  pedirPermissao(): Promise<NotificationPermission>;
  gerente(): Promise<GerentePush>;
}

export interface DependenciasPush {
  api: ClienteApi;
  navegador: NavegadorPush;
  guarda: GuardaDestinos;
}

/** `PushManager`, `serviceWorker` e `Notification` presentes. */
export function suportePush(janela: typeof globalThis = globalThis): boolean {
  const nav = (janela as { navigator?: Navigator }).navigator;
  return (
    typeof (janela as { PushManager?: unknown }).PushManager !== 'undefined' &&
    nav !== undefined &&
    'serviceWorker' in nav &&
    typeof (janela as { Notification?: unknown }).Notification !== 'undefined'
  );
}

/** O navegador de verdade. Nada é pedido ao criar: só quando cada função é chamada. */
export function navegadorPush(): NavegadorPush {
  const suporta = suportePush();
  return {
    suporta,
    permissao: () => (suporta ? Notification.permission : 'denied'),
    pedirPermissao: () => Notification.requestPermission(),
    gerente: async () =>
      (await navigator.serviceWorker.ready).pushManager as unknown as GerentePush,
  };
}

export function dependenciasPush(api: ClienteApi): DependenciasPush {
  return { api, navegador: navegadorPush(), guarda: guardaIndexedDb() };
}

function mesmosBytes(a: ArrayBuffer | null | undefined, b: Uint8Array | null): boolean {
  if (!a || !b) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/** Cancela no aparelho a assinatura feita com outra chave VAPID (NOT-62). */
async function descartarSeOutraChave(
  local: AssinaturaLocal | null,
  chave: Uint8Array | null,
  guarda: GuardaDestinos,
): Promise<AssinaturaLocal | null> {
  if (!local) return null;
  if (mesmosBytes(local.options?.applicationServerKey, chave)) return local;
  const endpoint = local.toJSON().endpoint;
  await local.unsubscribe();
  if (endpoint) await guarda.apagar(endpoint);
  return null;
}

/** Assina o destino (NOT-02, NOT-04, NOT-70). Chamar só a partir de um toque: pede a permissão. */
export async function assinar(
  destino: Destino,
  chavePublica: string,
  deps: DependenciasPush,
): Promise<EstadoPushLocal> {
  if (!deps.navegador.suporta) return 'sem_suporte';
  const permissao = await deps.navegador.pedirPermissao();
  if (permissao !== 'granted') return 'desligado';

  const chave = deBase64url(chavePublica);
  if (!chave) throw new Error('Chave pública VAPID inválida.');
  const gerente = await deps.navegador.gerente();
  let local = await descartarSeOutraChave(await gerente.getSubscription(), chave, deps.guarda);
  local ??= await gerente.subscribe({ userVisibleOnly: true, applicationServerKey: chave });

  const json = local.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
    throw new Error('Assinatura do navegador sem endpoint ou chaves.');
  await deps.api.post(caminhoDoDestino(destino), {
    endpoint: json.endpoint,
    chaves: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  await adicionarDestino(deps.guarda, json.endpoint, destino);
  return 'assinado';
}

/** Cancela o destino (NOT-16): `DELETE` e, sem outro destino no aparelho, `unsubscribe()`. */
export async function cancelar(destino: Destino, deps: DependenciasPush): Promise<EstadoPushLocal> {
  if (!deps.navegador.suporta) return 'sem_suporte';
  const gerente = await deps.navegador.gerente();
  const local = await gerente.getSubscription();
  if (!local) return 'nao_assinado';
  const json = local.toJSON();
  if (json.endpoint && json.keys?.auth) {
    await deps.api.delete(caminhoDoDestino(destino), {
      endpoint: json.endpoint,
      chaves: { auth: json.keys.auth },
    });
    await removerDestino(deps.guarda, json.endpoint, destino);
    if ((await deps.guarda.ler(json.endpoint)).length > 0) return 'nao_assinado';
  }
  await local.unsubscribe();
  return 'nao_assinado';
}

/** O estado do destino neste aparelho, sem pedir permissão (NOT-02, NOT-04, NOT-62, NOT-71). */
export async function estado(
  destino: Destino,
  chavePublica: string,
  deps: DependenciasPush,
): Promise<EstadoPushLocal> {
  if (!deps.navegador.suporta) return 'sem_suporte';
  const permissao = deps.navegador.permissao();
  if (permissao === 'denied') return 'desligado';
  if (permissao !== 'granted') return 'nao_assinado';

  const gerente = await deps.navegador.gerente();
  const local = await descartarSeOutraChave(
    await gerente.getSubscription(),
    deBase64url(chavePublica),
    deps.guarda,
  );
  if (!local) return 'nao_assinado';
  const json = local.toJSON();
  if (!json.endpoint || !json.keys?.auth) return 'nao_assinado';
  const r = await deps.api.post<{ assinado: boolean }>(`${caminhoDoDestino(destino)}/estado`, {
    endpoint: json.endpoint,
    chaves: { auth: json.keys.auth },
  });
  return r.assinado ? 'assinado' : 'nao_assinado';
}

export type { Destino };
