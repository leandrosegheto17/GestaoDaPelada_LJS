import { paraBase64url } from '@pelada/contrato/push';
import { describe, expect, it } from 'vitest';
import {
  enviarPush,
  TTL_RANKING,
  type AssinaturaParaEnvio,
} from '../../src/infraestrutura/push/enviar.ts';
import { novoCacheVapid, type ChavesVapid } from '../../src/infraestrutura/push/vapid.ts';

/**
 * CPU de 40 envios no Node (notificacoes T20; NOT-34; AD-112): a cifra `aes128gcm` (um par ECDH efêmero por mensagem,
 * HKDF e AES-GCM) e o VAPID (um JWT por origem, com o cache da invocação) de 40 assinaturas, medidos com
 * `process.cpuUsage` (todas as threads do processo, inclusive as da Web Crypto). Fica fora de `test/infraestrutura/push/`
 * porque aquela pasta roda no `workerd`, onde `process.cpuUsage` não mede a CPU do isolate.
 *
 * Orçamento: 6 ms, margem para os 10 ms de CPU do plano gratuito do Workers. A mediana de 5 rodadas, depois de uma de
 * aquecimento. O `fetch` é um falso que responde 201 sem ler o corpo: a medida é da cifra e do VAPID. Passou do
 * orçamento: a tarefa para e a sessão pergunta se reduz o lote (`LOTE_MAXIMO`).
 */

const ENVIOS = 40;
const RODADAS = 5;
// No runner Linux do GitHub as 5 rodadas mediram 31 a 41 ms (2026-11-06), de forma estável e não por ruído: lá o teto é
// 60 ms (decisão do usuário, 2026-11-06). Os 6 ms valem fora do CI; o orçamento real do Worker se confere no deploy.
const ORCAMENTO_MS = process.env.CI ? 60 : 6;

const PAYLOAD = JSON.stringify({
  titulo: 'Ranking atualizado',
  texto: 'Pelada de Quinta da Vila Madalena: partida de 05/11',
  caminho: '/g/pelada-de-quinta-da-vila-madalena?mes=2026-11',
});

async function vapid(): Promise<ChavesVapid> {
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

async function assinaturas(): Promise<AssinaturaParaEnvio[]> {
  const lista: AssinaturaParaEnvio[] = [];
  for (let i = 0; i < ENVIOS; i += 1) {
    const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const publica = new Uint8Array(
      (await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer,
    );
    lista.push({
      endpoint: `https://fcm.googleapis.com/fcm/send/cpu-${i}`,
      p256dh: paraBase64url(publica),
      auth: paraBase64url(crypto.getRandomValues(new Uint8Array(16))),
    });
  }
  return lista;
}

const aceito: typeof fetch = async () => new Response(null, { status: 201 });

/** CPU (ms) de uma invocação: 40 envios com o cache VAPID novo, como no consumidor. */
async function umaInvocacao(chaves: ChavesVapid, lista: AssinaturaParaEnvio[]): Promise<number> {
  const cache = novoCacheVapid();
  const inicio = process.cpuUsage();
  for (const a of lista) {
    const r = await enviarPush(a, PAYLOAD, {
      vapid: chaves,
      topico: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
      ttl: TTL_RANKING,
      cache,
      fetch: aceito,
      reportar: () => undefined,
    });
    if (r.classe !== 'aceito') throw new Error(`envio não aceito: ${r.classe}`);
  }
  const gasto = process.cpuUsage(inicio);
  return (gasto.user + gasto.system) / 1000;
}

describe('CPU de 40 envios', () => {
  it('NOT-34: a cifra e o VAPID de 40 envios ficam em até 6 ms de CPU no Node', async () => {
    const chaves = await vapid();
    const lista = await assinaturas();
    await umaInvocacao(chaves, lista); // aquecimento
    const medidas: number[] = [];
    for (let i = 0; i < RODADAS; i += 1) medidas.push(await umaInvocacao(chaves, lista));
    medidas.sort((a, b) => a - b);
    const mediana = medidas[Math.floor(RODADAS / 2)] as number;
    expect(
      mediana,
      `medidas (ms): ${medidas.map((m) => m.toFixed(2)).join(', ')}`,
    ).toBeLessThanOrEqual(ORCAMENTO_MS);
  });
});
