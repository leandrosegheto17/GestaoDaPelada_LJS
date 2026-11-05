import { paraBase64url } from '@pelada/contrato/push';
import { payloadCobranca, payloadRanking, serializarPayload } from '@pelada/dominio';
import { describe, expect, it } from 'vitest';
import { cifrarPayload } from '../../../src/infraestrutura/push/cifra.ts';
import { topicoDoGrupo } from '../../../src/infraestrutura/push/topico.ts';

/** Payload cifrado abaixo de 4096 bytes e `Topic` do grupo (T5; NOT-25, NOT-28, NOT-66; AD-110). Roda no `workerd`. */

/** Assinante qualquer: um par novo, como o navegador faria. */
async function assinante() {
  const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const publica = new Uint8Array((await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer);
  return { p256dh: paraBase64url(publica), auth: paraBase64url(crypto.getRandomValues(new Uint8Array(16))) };
}

/** Pior nome: 120 caracteres, todos emoji de 4 bytes em UTF-8. */
const PIOR_NOME = '🏆'.repeat(120);
/** Pior slug que o domínio de grupos aceita (GEL: até 60), de folga. */
const PIOR_SLUG = 'a'.repeat(80);
const GRUPO_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('payload cifrado', () => {
  it('NOT-25: o ranking com o pior nome fica abaixo de 4096 bytes depois de cifrado', async () => {
    const texto = serializarPayload(payloadRanking({ nomeGrupo: PIOR_NOME, slug: PIOR_SLUG, dataPartida: '2026-12-31' }));
    const corpo = await cifrarPayload(texto, await assinante());
    expect(corpo.length).toBeLessThan(4096);
  });

  it('NOT-25, NOT-43: a cobrança com o pior nome fica abaixo de 4096 bytes depois de cifrada', async () => {
    const texto = serializarPayload(payloadCobranca({ tipo: 'pagamento_confirmado', nomeGrupo: PIOR_NOME, grupoId: GRUPO_ID }));
    const corpo = await cifrarPayload(texto, await assinante());
    expect(corpo.length).toBeLessThan(4096);
  });
});

describe('topicoDoGrupo', () => {
  it('NOT-28: até 32 caracteres do alfabeto base64url', async () => {
    const topico = await topicoDoGrupo(GRUPO_ID);
    expect(topico).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    expect(topico).toHaveLength(32);
  });

  it('NOT-66: o mesmo grupo dá sempre o mesmo tópico, e outro grupo dá outro', async () => {
    expect(await topicoDoGrupo(GRUPO_ID)).toBe(await topicoDoGrupo(GRUPO_ID));
    expect(await topicoDoGrupo(GRUPO_ID)).not.toBe(await topicoDoGrupo('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'));
  });

  it('NOT-28: o tópico não contém o id do grupo', async () => {
    const topico = await topicoDoGrupo(GRUPO_ID);
    for (const pedaco of GRUPO_ID.split('-')) expect(topico).not.toContain(pedaco);
  });

  it('NOT-28: é o SHA-256 em base64url, cortado em 32 (AD-110)', async () => {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('42')));
    expect(await topicoDoGrupo('42')).toBe(paraBase64url(hash).slice(0, 32));
  });
});
