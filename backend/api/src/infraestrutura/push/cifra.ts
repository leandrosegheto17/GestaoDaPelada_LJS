import { deBase64url } from '@pelada/contrato/push';

/**
 * Cifra do payload de Web Push (T2; NOT-26): `aes128gcm` do RFC 8291 §3.4 sobre o RFC 8188 §2, do zero com a Web
 * Crypto (AD-099). Roda no `workerd`, e o vetor do Apêndice A rodando lá é a prova da P-256 (AD-100).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Vetor do Apêndice A: com a chave efêmera e o sal injetados, a saída é byte a byte a do RFC.
 * - Payload vazio: cifra só o delimitador `0x02`.
 * - Payload de 3993 bytes: o corpo inteiro fica em 4096 bytes (cabeçalho de 86, delimitador e tag de 16), o limite
 *   que o serviço de push aceita sem 413 (RFC 8030 §7.2). Acima disso, `ErroPayloadGrande`, sem cifrar.
 * - Chave do assinante inválida (tamanho, sem `0x04`, ponto fora da curva) ou `auth` de outro tamanho:
 *   `ErroChaveAssinante`, sem cifrar.
 *
 * Um único registro, sem preenchimento: o tamanho do texto não é segredo aqui (o payload é público por natureza).
 */

/** Tamanho do registro declarado no cabeçalho (RFC 8291 §4). */
export const TAMANHO_REGISTRO = 4096;
/** Sal (16) + rs (4) + idlen (1) + chave efêmera (65). */
export const TAMANHO_CABECALHO = 86;
const TAMANHO_TAG = 16;
/** Maior texto que cabe em 4096 bytes de corpo. */
export const PAYLOAD_MAX_BYTES = TAMANHO_REGISTRO - TAMANHO_CABECALHO - TAMANHO_TAG - 1;

export class ErroChaveAssinante extends Error {
  override name = 'ErroChaveAssinante';
}

export class ErroPayloadGrande extends Error {
  override name = 'ErroPayloadGrande';
}

export interface ChavesAssinante {
  /** base64url, 65 bytes. */
  p256dh: string;
  /** base64url, 16 bytes. */
  auth: string;
}

/** Só para o teste do vetor: a chave efêmera (pública de 65 bytes, privada `d` de 32) e o sal. */
export interface OpcoesCifra {
  efemera?: { publica: Uint8Array; privada: Uint8Array };
  sal?: Uint8Array;
}

const codificador = new TextEncoder();
const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;

function juntar(...partes: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const saida = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    saida.set(p, i);
    i += p.length;
  }
  return saida;
}

function base64urlDeBytes(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** JWK de uma chave P-256 a partir do ponto não comprimido (65 bytes) e, se houver, do `d`. */
export function jwkP256(publica: Uint8Array, privada?: Uint8Array): JsonWebKey {
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: base64urlDeBytes(publica.subarray(1, 33)),
    y: base64urlDeBytes(publica.subarray(33, 65)),
    ext: true,
  };
  if (privada) jwk.d = base64urlDeBytes(privada);
  return jwk;
}

async function hkdf(
  sal: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
) {
  const chave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: sal, info },
    chave,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

async function parEfemero(
  opcoes: OpcoesCifra,
): Promise<{ privada: CryptoKey; publica: Uint8Array<ArrayBuffer> }> {
  if (opcoes.efemera) {
    const privada = await crypto.subtle.importKey(
      'jwk',
      jwkP256(opcoes.efemera.publica, opcoes.efemera.privada),
      P256,
      false,
      ['deriveBits'],
    );
    return { privada, publica: juntar(opcoes.efemera.publica) };
  }
  const par = (await crypto.subtle.generateKey(P256, true, ['deriveBits'])) as CryptoKeyPair;
  const publica = new Uint8Array(
    (await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer,
  );
  return { privada: par.privateKey, publica };
}

/** Corpo cifrado pronto para o `fetch` (`Content-Encoding: aes128gcm`). */
export async function cifrarPayload(
  texto: string,
  assinante: ChavesAssinante,
  opcoes: OpcoesCifra = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublica = deBase64url(assinante.p256dh);
  const segredo = deBase64url(assinante.auth);
  if (
    !uaPublica ||
    uaPublica.length !== 65 ||
    uaPublica[0] !== 0x04 ||
    !segredo ||
    segredo.length !== 16
  ) {
    throw new ErroChaveAssinante('Chave do assinante inválida.');
  }
  const claro = codificador.encode(texto);
  if (claro.length > PAYLOAD_MAX_BYTES)
    throw new ErroPayloadGrande(`Payload acima de ${PAYLOAD_MAX_BYTES} bytes.`);

  let chaveUa: CryptoKey;
  try {
    chaveUa = await crypto.subtle.importKey('raw', juntar(uaPublica), P256, false, []);
  } catch {
    throw new ErroChaveAssinante('Chave do assinante inválida.');
  }

  const efemera = await parEfemero(opcoes);
  const sal = opcoes.sal ? juntar(opcoes.sal) : crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 §3.3 e §3.4: segredo ECDH, IKM com o `auth` como sal e "WebPush: info" || 0x00 || ua || as.
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: chaveUa }, efemera.privada, 256),
  );
  const infoChave = juntar(codificador.encode('WebPush: info\0'), uaPublica, efemera.publica);
  const ikm = await hkdf(juntar(segredo), ecdh, infoChave, 32);

  // RFC 8188 §2.2 e §2.3: CEK de 16 bytes e nonce de 12, com o sal do cabeçalho.
  const cek = await hkdf(sal, ikm, codificador.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, codificador.encode('Content-Encoding: nonce\0'), 12);

  // Registro único e último: texto || 0x02 (RFC 8188 §2; RFC 8291 §4).
  const registro = juntar(claro, new Uint8Array([0x02]));
  const chaveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chaveAes, registro),
  );

  // Cabeçalho do RFC 8188 §2.1: sal, rs em 4 bytes big-endian, idlen e a chave pública efêmera.
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, TAMANHO_REGISTRO);
  return juntar(sal, rs, new Uint8Array([efemera.publica.length]), efemera.publica, cifrado);
}
