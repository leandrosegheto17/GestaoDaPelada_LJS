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
export const HOSTS_PUSH_EXATOS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'] as const;
/** Sufixos aceitos só com subdomínio (`*.push.apple.com`; o do Edge é PREMISSA, AD-109). */
export const SUFIXOS_PUSH = ['.push.apple.com', '.notify.windows.com'] as const;

export const LIMITES_PUSH = { endpointMax: 1024, p256dhBytes: 65, authBytes: 16 } as const;

export const CODIGO_PUSH_INDISPONIVEL = 'push_indisponivel';
export const CODIGO_LIMITE_ASSINATURAS = 'limite_assinaturas';

export const MENSAGEM_ENDPOINT = 'Endereço de push não aceito.';
export const MENSAGEM_CHAVE = 'Chave de push inválida.';

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** Bytes de um texto base64url sem preenchimento; `null` se o texto não é base64url válido. */
export function deBase64url(texto: string): Uint8Array | null {
  if (!BASE64URL.test(texto) || texto.length % 4 === 1) return null;
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texto.length % 4)) % 4);
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

/** Host na lista (AD-109). `extras` é o `PUSH_HOSTS_DEV`, que só existe no ambiente local (T27). */
export function hostPushAceito(host: string, extras: readonly string[] = []): boolean {
  const h = host.toLowerCase();
  if (h === '' || IPV4.test(h) || h.startsWith('[')) return false;
  if ((HOSTS_PUSH_EXATOS as readonly string[]).includes(h)) return true;
  if (extras.map((e) => e.toLowerCase()).includes(h)) return true;
  return SUFIXOS_PUSH.some((sufixo) => h.endsWith(sufixo) && h.length > sufixo.length);
}

/**
 * `endpoint` aceito: https, até 1024 caracteres, sem credencial, sem porta, sem IP literal e com host da lista.
 * A autoridade é conferida no texto cru, porque o `URL` apaga `:443` e não mostra a porta padrão.
 */
export function endpointPushAceito(endpoint: string, extras: readonly string[] = []): boolean {
  if (endpoint.length > LIMITES_PUSH.endpointMax) return false;
  const cru = /^https:\/\/([^/?#]*)/i.exec(endpoint);
  if (!cru) return false;
  const autoridade = cru[1] ?? '';
  if (autoridade.includes('@') || autoridade.includes(':') || autoridade.startsWith('[')) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return false;
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
  return z.string({ error: MENSAGEM_ENDPOINT }).refine((e) => endpointPushAceito(e, extras), { error: MENSAGEM_ENDPOINT });
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
