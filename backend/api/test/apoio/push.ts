import { deBase64url, paraBase64url } from '@pelada/contrato/push';
import { jwkP256 } from '../../src/infraestrutura/push/cifra.ts';
import type { ChavesVapid } from '../../src/infraestrutura/push/vapid.ts';

/**
 * Apoio dos testes de push (notificacoes T25): chaves VAPID e de assinante geradas na hora, e a decifra do lado do
 * navegador (RFC 8291 §3.4 com os papéis trocados), escrita sem usar a cifra, no mesmo método da decifra do
 * `test/infraestrutura/push/cifra.test.ts`. Serve para ler o payload que o serviço de push falso recebeu.
 */

function b(texto: string): Uint8Array<ArrayBuffer> {
  const bytes = deBase64url(texto);
  if (!bytes) throw new Error(`base64url inválido no teste: ${texto}`);
  return new Uint8Array(bytes);
}

async function hkdf(
  sal: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: string | Uint8Array<ArrayBuffer>,
  bytes: number,
) {
  const chave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const infoBytes = typeof info === 'string' ? new TextEncoder().encode(info) : info;
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: sal, info: infoBytes },
      chave,
      bytes * 8,
    ),
  );
}

export async function chavesVapidDeTeste(): Promise<ChavesVapid> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', par.privateKey)) as JsonWebKey;
  const publica = new Uint8Array(
    (await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer,
  );
  return {
    publica: paraBase64url(publica),
    privada: jwk.d ?? '',
    assunto: 'mailto:avisos@exemplo.com',
  };
}

/** Um assinante com a chave privada guardada, para decifrar o que receber. */
export interface AssinanteDeTeste {
  p256dh: string;
  auth: string;
  privada: string;
}

export async function assinanteDeTeste(): Promise<AssinanteDeTeste> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const publica = new Uint8Array(
    (await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer,
  );
  const jwk = (await crypto.subtle.exportKey('jwk', par.privateKey)) as JsonWebKey;
  return {
    p256dh: paraBase64url(publica),
    auth: paraBase64url(crypto.getRandomValues(new Uint8Array(16))),
    privada: jwk.d ?? '',
  };
}

/** O texto do payload que o assinante recebeu. Lança se o corpo não é um registro `aes128gcm` dele. */
export async function decifrarPush(
  corpo: Uint8Array,
  assinante: AssinanteDeTeste,
): Promise<string> {
  const sal = new Uint8Array(corpo.subarray(0, 16));
  const idlen = corpo[20] ?? 0;
  if (idlen !== 65) throw new Error('cabeçalho aes128gcm inesperado');
  const asPublica = new Uint8Array(corpo.subarray(21, 21 + idlen));
  const cifrado = new Uint8Array(corpo.subarray(21 + idlen));

  const ua = b(assinante.p256dh);
  const privada = await crypto.subtle.importKey(
    'jwk',
    jwkP256(ua, b(assinante.privada)),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const publica = await crypto.subtle.importKey(
    'raw',
    asPublica,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: publica }, privada, 256),
  );
  const info = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\0'),
    ...ua,
    ...asPublica,
  ]);
  const ikm = await hkdf(b(assinante.auth), ecdh, info, 32);
  const cek = await hkdf(sal, ikm, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = await hkdf(sal, ikm, 'Content-Encoding: nonce\0', 12);
  const chave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const registro = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, chave, cifrado),
  );
  let fim = registro.length - 1;
  while (fim >= 0 && registro[fim] === 0) fim -= 1;
  if (registro[fim] !== 0x02) throw new Error('delimitador do último registro ausente');
  return new TextDecoder().decode(registro.subarray(0, fim));
}
