import { deBase64url, paraBase64url } from '@pelada/contrato/push';
import { describe, expect, it } from 'vitest';
import { jwkP256 } from '../../../src/infraestrutura/push/cifra.ts';
import {
  cabecalhoVapid,
  ErroChavesVapid,
  novoCacheVapid,
  VALIDADE_JWT_S,
  type ChavesVapid,
} from '../../../src/infraestrutura/push/vapid.ts';

/** Cabeçalho VAPID do RFC 8292 (T3; NOT-27; AD-099). Roda no `workerd`. */

const AGORA = new Date('2026-11-05T12:00:00Z');
const ASSUNTO = 'mailto:avisos@exemplo.com';

function b(texto: string): Uint8Array<ArrayBuffer> {
  const bytes = deBase64url(texto);
  if (!bytes) throw new Error('base64url inválido no teste');
  return new Uint8Array(bytes);
}

/** Par novo no formato das variáveis: pública de 65 bytes e `d` de 32, em base64url. */
async function parVapid(): Promise<{ publica: string; privada: string }> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', par.privateKey)) as JsonWebKey;
  const publica = new Uint8Array([0x04, ...b(jwk.x ?? ''), ...b(jwk.y ?? '')]);
  return { publica: paraBase64url(publica), privada: jwk.d ?? '' };
}

/** Separa `vapid t=…, k=…`, confere a assinatura do JWT com a pública e devolve as partes. */
async function lerCabecalho(valor: string, publica: string) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(valor);
  expect(m).not.toBeNull();
  const [jwt, k] = [m?.[1] ?? '', m?.[2] ?? ''];
  const [h, c, s] = jwt.split('.');
  const chave = await crypto.subtle.importKey('jwk', jwkP256(b(publica)), { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'verify',
  ]);
  const valido = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    chave,
    b(s ?? ''),
    new TextEncoder().encode(`${h}.${c}`),
  );
  const decodificar = (parte: string | undefined) => JSON.parse(new TextDecoder().decode(b(parte ?? ''))) as Record<string, unknown>;
  return { valido, k, cabecalho: decodificar(h), corpo: decodificar(c), assinatura: b(s ?? '') };
}

describe('cabecalhoVapid', () => {
  it('NOT-27: o JWT verifica com a chave pública, com aud, exp ≤ 24 h e sub', async () => {
    const par = await parVapid();
    const chaves: ChavesVapid = { ...par, assunto: ASSUNTO };
    const valor = await cabecalhoVapid('https://fcm.googleapis.com/fcm/send/abc?x=1#y', chaves, AGORA);
    const lido = await lerCabecalho(valor, par.publica);
    expect(lido.valido).toBe(true);
    expect(lido.k).toBe(par.publica);
    expect(lido.assinatura).toHaveLength(64);
    expect(lido.cabecalho).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(lido.corpo.aud).toBe('https://fcm.googleapis.com');
    expect(lido.corpo.sub).toBe(ASSUNTO);
    const agoraS = AGORA.getTime() / 1000;
    expect(lido.corpo.exp).toBe(agoraS + VALIDADE_JWT_S);
    expect(Number(lido.corpo.exp) - agoraS).toBeLessThanOrEqual(24 * 60 * 60);
    expect(Number(lido.corpo.exp)).toBeGreaterThan(agoraS);
  });

  it('NOT-27: duas origens dão dois aud; a mesma origem reaproveita o cabeçalho da invocação', async () => {
    const par = await parVapid();
    const chaves: ChavesVapid = { ...par, assunto: ASSUNTO };
    const cache = novoCacheVapid();
    const fcm1 = await cabecalhoVapid('https://fcm.googleapis.com/fcm/send/a', chaves, AGORA, cache);
    const fcm2 = await cabecalhoVapid('https://fcm.googleapis.com/fcm/send/b', chaves, AGORA, cache);
    const apple = await cabecalhoVapid('https://web.push.apple.com/c', chaves, AGORA, cache);
    expect(fcm2).toBe(fcm1);
    expect((await lerCabecalho(apple, par.publica)).corpo.aud).toBe('https://web.push.apple.com');
    expect((await lerCabecalho(fcm1, par.publica)).corpo.aud).toBe('https://fcm.googleapis.com');
  });

  it('NOT-27: chave privada que não casa com a pública falha antes de gerar cabeçalho', async () => {
    const um = await parVapid();
    const outro = await parVapid();
    const chaves: ChavesVapid = { publica: um.publica, privada: outro.privada, assunto: ASSUNTO };
    await expect(cabecalhoVapid('https://fcm.googleapis.com/x', chaves, AGORA)).rejects.toBeInstanceOf(ErroChavesVapid);
  });

  it.each([
    ['pública curta', (p: { publica: string; privada: string }) => ({ ...p, publica: p.publica.slice(0, 40), assunto: ASSUNTO })],
    ['privada curta', (p: { publica: string; privada: string }) => ({ ...p, privada: p.privada.slice(0, 20), assunto: ASSUNTO })],
    ['assunto vazio', (p: { publica: string; privada: string }) => ({ ...p, assunto: ' ' })],
  ])('NOT-27: %s dá ErroChavesVapid', async (_caso, montar) => {
    const chaves = montar(await parVapid());
    await expect(cabecalhoVapid('https://fcm.googleapis.com/x', chaves, AGORA)).rejects.toBeInstanceOf(ErroChavesVapid);
  });
});
