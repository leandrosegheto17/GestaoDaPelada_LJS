import { z } from 'zod';

/**
 * Contrato da assinatura de push (T1; NOT-06, NOT-67; AD-066, AD-109). Só `endpoint` HTTPS de serviço de push
 * conhecido, contra SSRF: a API vai fazer `fetch` nele.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - `http://` ou outro esquema: recusado.
 * - Host parecido (`fcm.googleapis.com.mal.example`), sufixo sem ponto (`malpush.apple.com`) e o próprio
 *   `push.apple.com` sem subdomínio: recusados; subdomínio de `push.apple.com` (`web.push.apple.com`): aceito.
 * - Porta explícita (inclusive `:443`, que o `URL` normaliza e esconde), `user@host` e `user:senha@host`: recusados.
 * - IP literal (v4 ou `[v6]`): recusado.
 * - Acima de 1024 caracteres: recusado.
 * - `p256dh` comprimido (33 bytes), de 65 bytes sem o `0x04` inicial, `auth` de 15 ou 17 bytes: recusados.
 * - base64 comum (`+`, `/`) ou com `=`: recusado; só base64url sem preenchimento.
 * - Campo a mais, em qualquer nível, e corpo que não é objeto: recusados.
 */

/** Hosts exatos aceitos (AD-109, `S:241`). */
export const HOSTS_PUSH_EXATOS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
] as const;
/** Sufixos aceitos só com subdomínio (`*.push.apple.com`; o do Edge é PREMISSA, AD-109). */
export const SUFIXOS_PUSH = ['.push.apple.com', '.notify.windows.com'] as const;

export const LIMITES_PUSH = { endpointMax: 1024, p256dhBytes: 65, authBytes: 16 } as const;

export const CODIGO_PUSH_INDISPONIVEL = 'push_indisponivel';
export const CODIGO_LIMITE_ASSINATURAS = 'limite_assinaturas';

/** Teto do corpo das rotas de push (notificacoes T28 a T31; NOT-67): acima dele, 413 antes de ler o JSON. */
export const LIMITE_CORPO_PUSH_BYTES = 4096;

/** Mensagens das recusas das rotas de push (T28 a T31). */
export const MENSAGEM_PUSH_INDISPONIVEL = 'Os avisos não estão disponíveis para este grupo.';
export const MENSAGEM_LIMITE_ASSINATURAS = 'Este grupo já tem o máximo de aparelhos recebendo avisos.';

/** Corpo das recusas `push_indisponivel` (403, 503) e `limite_assinaturas` (409). */
export interface ErroPush {
  erro: string;
  codigo: typeof CODIGO_PUSH_INDISPONIVEL | typeof CODIGO_LIMITE_ASSINATURAS;
}

/**
 * `GET /api/publico/:slug/push` (T28; NOT-01, NOT-14, NOT-61; AD-103): se o controle aparece e a chave pública VAPID
 * para o `subscribe`. Sem push, `chavePublica` é `null`. A chave privada nunca está aqui.
 */
export interface DisponibilidadePush {
  disponivel: boolean;
  chavePublica: string | null;
}

/** `POST …/push/estado` e a resposta do `POST …/push` (T28, T29; NOT-71). */
export interface EstadoPush {
  assinado: boolean;
}

export const MENSAGEM_ENDPOINT = 'Endereço de push não aceito.';
export const MENSAGEM_CHAVE = 'Chave de push inválida.';

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** Bytes de um texto base64url sem preenchimento; `null` se o texto não é base64url válido. */
export function deBase64url(texto: string): Uint8Array | null {
  if (!BASE64URL.test(texto) || texto.length % 4 === 1) return null;
  const base64 =
    texto.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texto.length % 4)) % 4);
  let binario: string;
  try {
    binario = atob(base64);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Texto base64url sem preenchimento. */
export function paraBase64url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Entrada válida de `PUSH_HOSTS_DEV` (notificacoes T27; NOT-63): só `localhost` ou um subdomínio dele (RFC 6761, sempre
 * a própria máquina), com porta opcional. Qualquer outro host na variável é ignorado: nem por engano ela abre a API
 * para um serviço de push que não está na lista (AD-109).
 */
const HOST_DEV = /^(?:[a-z0-9-]+\.)*localhost(?::\d{1,5})?$/;

/** `PUSH_HOSTS_DEV` (só no `.env` local e no e2e) em lista: separada por vírgula, em minúsculas, só as entradas válidas. */
export function hostsPushDev(valor: string | undefined): string[] {
  if (valor === undefined) return [];
  return valor
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => HOST_DEV.test(e));
}

/** Só as entradas de dev válidas, mesmo que quem chama passe outra coisa. */
const extrasValidos = (extras: readonly string[]): string[] =>
  extras.map((e) => e.trim().toLowerCase()).filter((e) => HOST_DEV.test(e));

/** Host na lista (AD-109). `extras` é o `PUSH_HOSTS_DEV`, que só existe no ambiente local (T27). */
export function hostPushAceito(host: string, extras: readonly string[] = []): boolean {
  const h = host.toLowerCase();
  if (h === '' || IPV4.test(h) || h.startsWith('[')) return false;
  if ((HOSTS_PUSH_EXATOS as readonly string[]).includes(h)) return true;
  if (extrasValidos(extras).some((e) => e === h)) return true;
  return SUFIXOS_PUSH.some((sufixo) => h.endsWith(sufixo) && h.length > sufixo.length);
}

/**
 * O serviço de push falso do ambiente local e do e2e (T27): `http` ou `https` em `localhost` (ou subdomínio), com a
 * porta, só quando `host:porta` está em `PUSH_HOSTS_DEV`. Sem a variável, `localhost` é recusado como qualquer host.
 */
function endpointDevAceito(endpoint: string, extras: readonly string[]): boolean {
  const validos = extrasValidos(extras);
  if (validos.length === 0) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username !== '' || url.password !== '') return false;
  if (!HOST_DEV.test(url.hostname) || url.hostname.includes(':')) return false;
  return validos.includes(url.host.toLowerCase());
}

/**
 * `endpoint` aceito: https, até 1024 caracteres, sem credencial, sem porta, sem IP literal e com host da lista.
 * A autoridade é conferida no texto cru, porque o `URL` apaga `:443` e não mostra a porta padrão.
 */
export function endpointPushAceito(endpoint: string, extras: readonly string[] = []): boolean {
  if (endpoint.length > LIMITES_PUSH.endpointMax) return false;
  if (endpointDevAceito(endpoint, extras)) return true;
  const cru = /^https:\/\/([^/?#]*)/i.exec(endpoint);
  if (!cru) return false;
  const autoridade = cru[1] ?? '';
  if (autoridade.includes('@') || autoridade.includes(':') || autoridade.startsWith('['))
    return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '')
    return false;
  return hostPushAceito(url.hostname, extras);
}

function chave(bytes: number, primeiro?: number) {
  return z.string({ error: MENSAGEM_CHAVE }).refine(
    (texto) => {
      const b = deBase64url(texto);
      return b !== null && b.length === bytes && (primeiro === undefined || b[0] === primeiro);
    },
    { error: MENSAGEM_CHAVE },
  );
}

/** Chave pública do assinante: ponto P-256 não comprimido, 65 bytes começando em `0x04`. */
export const p256dh = chave(LIMITES_PUSH.p256dhBytes, 0x04);
/** Segredo de autenticação do assinante: 16 bytes. */
export const auth = chave(LIMITES_PUSH.authBytes);

function endpoint(extras: readonly string[]) {
  // O teto de 1024 fica no `endpointPushAceito`: um `.max` aqui somaria uma segunda mensagem igual no campo.
  return z
    .string({ error: MENSAGEM_ENDPOINT })
    .refine((e) => endpointPushAceito(e, extras), { error: MENSAGEM_ENDPOINT });
}

/** Corpo de `POST .../push`: `endpoint` e as duas chaves do `PushSubscription.toJSON()`. */
export function criarAssinaturaPushCorpo(extras: readonly string[] = []) {
  return z
    .object({
      endpoint: endpoint(extras),
      chaves: z.object({ p256dh, auth }).strict(),
    })
    .strict();
}

/** Corpo de `DELETE .../push` e de `POST .../push/estado`: `endpoint` e `auth`, que provam a posse. */
export function criarCancelarPushCorpo(extras: readonly string[] = []) {
  return z
    .object({
      endpoint: endpoint(extras),
      chaves: z.object({ auth }).strict(),
    })
    .strict();
}

export const assinaturaPushCorpo = criarAssinaturaPushCorpo();
export type AssinaturaPushCorpo = z.infer<typeof assinaturaPushCorpo>;

export const cancelarPushCorpo = criarCancelarPushCorpo();
export type CancelarPushCorpo = z.infer<typeof cancelarPushCorpo>;
