import { deBase64url, paraBase64url } from '@pelada/contrato/push';
import { describe, expect, it } from 'vitest';
import {
  cifrarPayload,
  ErroChaveAssinante,
  ErroPayloadGrande,
  jwkP256,
  PAYLOAD_MAX_BYTES,
  TAMANHO_REGISTRO,
} from '../../../src/infraestrutura/push/cifra.ts';

/**
 * Cifra `aes128gcm` do RFC 8291 (T2; NOT-26; AD-099, AD-100). Roda no pool do `workerd` (projeto `worker` do
 * `vitest.config.ts`): o vetor passando aqui é a prova de que a P-256 da Web Crypto do Workers serve.
 */

/**
 * Vetor do RFC 8291, Apêndice A (https://www.rfc-editor.org/rfc/rfc8291.html#appendix-A). Valores transcritos do
 * texto do RFC; se o teste do vetor falhar, confira primeiro cada linha contra o RFC antes de mexer na cifra.
 */
const VETOR = {
  texto: 'When I grow up, I want to be a watermelon',
  asPublica:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivada: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublica:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivada: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  sal: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  corpo:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
} as const;

function b(texto: string): Uint8Array<ArrayBuffer> {
  const bytes = deBase64url(texto);
  if (!bytes) throw new Error(`base64url inválido no teste: ${texto}`);
  return new Uint8Array(bytes);
}

const ASSINANTE = { p256dh: VETOR.uaPublica, auth: VETOR.auth };
const OPCOES_VETOR = {
  efemera: { publica: b(VETOR.asPublica), privada: b(VETOR.asPrivada) },
  sal: b(VETOR.sal),
};

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

/**
 * Decifra do lado do navegador, escrita aqui sem usar a cifra (o lado de quem recebe, RFC 8291 §3.4 com os papéis
 * trocados): lê o cabeçalho, deriva com a chave privada do assinante e tira o delimitador.
 */
async function decifrar(
  corpo: Uint8Array,
  uaPublica: string,
  uaPrivada: string,
  auth: string,
): Promise<string> {
  const sal = new Uint8Array(corpo.subarray(0, 16));
  const rs = new DataView(corpo.buffer, corpo.byteOffset + 16, 4).getUint32(0);
  expect(rs).toBe(TAMANHO_REGISTRO);
  const idlen = corpo[20] ?? 0;
  expect(idlen).toBe(65);
  const asPublica = new Uint8Array(corpo.subarray(21, 21 + idlen));
  const cifrado = new Uint8Array(corpo.subarray(21 + idlen));

  const ua = b(uaPublica);
  const privada = await crypto.subtle.importKey(
    'jwk',
    jwkP256(ua, b(uaPrivada)),
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
  const ikm = await hkdf(b(auth), ecdh, info, 32);
  const cek = await hkdf(sal, ikm, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = await hkdf(sal, ikm, 'Content-Encoding: nonce\0', 12);
  const chave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const registro = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, chave, cifrado),
  );
  let fim = registro.length - 1;
  while (fim >= 0 && registro[fim] === 0) fim -= 1;
  expect(registro[fim]).toBe(0x02);
  return new TextDecoder().decode(registro.subarray(0, fim));
}

describe('cifrarPayload', () => {
  it('NOT-26: com a chave efêmera e o sal do Apêndice A, a saída é byte a byte o vetor do RFC 8291', async () => {
    const corpo = await cifrarPayload(VETOR.texto, ASSINANTE, OPCOES_VETOR);
    expect(paraBase64url(corpo)).toBe(VETOR.corpo);
  });

  it('NOT-26: o vetor é decifrado com a chave privada do assinante (ida e volta)', async () => {
    const corpo = await cifrarPayload(VETOR.texto, ASSINANTE, OPCOES_VETOR);
    expect(await decifrar(corpo, VETOR.uaPublica, VETOR.uaPrivada, VETOR.auth)).toBe(VETOR.texto);
  });

  it('NOT-26: sem opções, a chave efêmera e o sal são novos a cada envio e o assinante decifra', async () => {
    const um = await cifrarPayload(VETOR.texto, ASSINANTE);
    const dois = await cifrarPayload(VETOR.texto, ASSINANTE);
    expect(paraBase64url(um)).not.toBe(paraBase64url(dois));
    expect(paraBase64url(um.subarray(21, 86))).not.toBe(VETOR.asPublica);
    expect(await decifrar(um, VETOR.uaPublica, VETOR.uaPrivada, VETOR.auth)).toBe(VETOR.texto);
    expect(await decifrar(dois, VETOR.uaPublica, VETOR.uaPrivada, VETOR.auth)).toBe(VETOR.texto);
  });

  it('NOT-26: payload vazio cifra só o delimitador', async () => {
    const corpo = await cifrarPayload('', ASSINANTE);
    expect(corpo.length).toBe(86 + 1 + 16);
    expect(await decifrar(corpo, VETOR.uaPublica, VETOR.uaPrivada, VETOR.auth)).toBe('');
  });

  it('NOT-25, NOT-26: 3993 bytes fecham o corpo em 4096; um byte a mais é recusado sem cifrar', async () => {
    expect(PAYLOAD_MAX_BYTES).toBe(3993);
    const corpo = await cifrarPayload('a'.repeat(3993), ASSINANTE);
    expect(corpo.length).toBe(4096);
    expect(await decifrar(corpo, VETOR.uaPublica, VETOR.uaPrivada, VETOR.auth)).toBe(
      'a'.repeat(3993),
    );
    await expect(cifrarPayload('a'.repeat(3994), ASSINANTE)).rejects.toBeInstanceOf(
      ErroPayloadGrande,
    );
  });

  it('NOT-25: o limite conta bytes UTF-8, não caracteres', async () => {
    await expect(cifrarPayload('é'.repeat(2000), ASSINANTE)).rejects.toBeInstanceOf(
      ErroPayloadGrande,
    );
  });

  it.each([
    [
      'p256dh comprimido de 33 bytes',
      { p256dh: paraBase64url(new Uint8Array(33).fill(2)), auth: VETOR.auth },
    ],
    ['p256dh sem 0x04', { p256dh: paraBase64url(new Uint8Array(65).fill(5)), auth: VETOR.auth }],
    [
      'ponto fora da curva',
      {
        p256dh: paraBase64url(new Uint8Array([4, ...new Uint8Array(64).fill(1)])),
        auth: VETOR.auth,
      },
    ],
    ['p256dh que não é base64url', { p256dh: 'não+base64', auth: VETOR.auth }],
    ['auth de 15 bytes', { p256dh: VETOR.uaPublica, auth: paraBase64url(new Uint8Array(15)) }],
  ])('NOT-26: %s dá ErroChaveAssinante', async (_caso, assinante) => {
    await expect(cifrarPayload(VETOR.texto, assinante)).rejects.toBeInstanceOf(ErroChaveAssinante);
  });
});
