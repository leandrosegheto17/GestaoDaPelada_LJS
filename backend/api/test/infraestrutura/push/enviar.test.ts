import { paraBase64url } from '@pelada/contrato/push';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enviarPush,
  segundosDoRetryAfter,
  servicoPushFalso,
  TTL_COBRANCA,
  TTL_RANKING,
  type AssinaturaParaEnvio,
  type RelatoPush,
} from '../../../src/infraestrutura/push/enviar.ts';
import type { ChavesVapid } from '../../../src/infraestrutura/push/vapid.ts';

/** Cliente de envio Web Push (T6; NOT-27 a NOT-33, NOT-63). Roda no `workerd`, com o serviço de push falso. */

const AGORA = new Date('2026-11-05T12:00:00Z');
const TOPICO = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const PAYLOAD = JSON.stringify({
  titulo: 'Ranking atualizado',
  texto: 'Pelada Secreta: partida de 05/11',
  caminho: '/g/pelada-secreta?mes=2026-11',
});
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/token-do-aparelho-secreto-123';

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

async function assinatura(endpoint = ENDPOINT): Promise<AssinaturaParaEnvio> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const publica = new Uint8Array(
    (await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer,
  );
  return {
    endpoint,
    p256dh: paraBase64url(publica),
    auth: paraBase64url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

/** Prepara um envio com o serviço falso, o relato do Sentry capturado e o console espionado. */
async function cenario() {
  const servico = servicoPushFalso();
  const relatos: RelatoPush[] = [];
  const chaves = await vapid();
  const a = await assinatura();
  const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m),
  );
  const enviar = (ttl = TTL_RANKING, sobre: Partial<AssinaturaParaEnvio> = {}) =>
    enviarPush({ ...a, ...sobre }, PAYLOAD, {
      vapid: chaves,
      topico: TOPICO,
      ttl,
      agora: AGORA,
      fetch: servico.fetch,
      reportar: (r) => relatos.push(r),
    });
  /** NOT-33: nada do que é secreto aparece no console nem no relato do Sentry. */
  const esperaSemSegredo = () => {
    const texto = JSON.stringify([relatos, consoles.map((c) => c.mock.calls)]);
    for (const proibido of [
      a.endpoint,
      'token-do-aparelho-secreto',
      a.p256dh,
      a.auth,
      PAYLOAD,
      'Pelada Secreta',
      chaves.privada,
    ]) {
      expect(texto).not.toContain(proibido);
    }
  };
  return { servico, relatos, chaves, a, enviar, esperaSemSegredo };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('enviarPush: requisição', () => {
  it('NOT-27, NOT-28: a requisição leva os 5 cabeçalhos com os valores esperados e o corpo cifrado', async () => {
    const c = await cenario();
    await c.enviar();
    expect(c.servico.pedidos).toHaveLength(1);
    const [pedido] = c.servico.pedidos;
    expect(pedido?.url).toBe(ENDPOINT);
    const h = pedido?.cabecalhos;
    expect(h?.get('content-encoding')).toBe('aes128gcm');
    expect(h?.get('ttl')).toBe(String(TTL_RANKING));
    expect(h?.get('urgency')).toBe('normal');
    expect(h?.get('topic')).toBe(TOPICO);
    expect(h?.get('authorization')).toMatch(
      new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${c.chaves.publica}$`),
    );
    expect(pedido?.corpo.length).toBeGreaterThan(86);
    expect(new TextDecoder().decode(pedido?.corpo)).not.toContain('Ranking atualizado');
  });

  it('NOT-27: o TTL da cobrança é 172800', async () => {
    const c = await cenario();
    await c.enviar(TTL_COBRANCA);
    expect(c.servico.pedidos[0]?.cabecalhos.get('ttl')).toBe('172800');
  });

  it('NOT-06: host fora da lista não chama o fetch e reporta sem o host', async () => {
    const c = await cenario();
    const r = await c.enviar(TTL_RANKING, { endpoint: 'https://interno.exemplo.com/push' });
    expect(r).toEqual({ classe: 'erro' });
    expect(c.servico.pedidos).toHaveLength(0);
    expect(c.relatos).toEqual([{ host: '', status: 0, motivo: 'host_fora_da_lista' }]);
  });
});

describe('enviarPush: classes da resposta', () => {
  it('NOT-29: 201 é aceito, sem relato', async () => {
    const c = await cenario();
    c.servico.responder(201);
    expect(await c.enviar()).toEqual({ classe: 'aceito' });
    expect(c.relatos).toEqual([]);
    c.esperaSemSegredo();
  });

  it.each([404, 410])('NOT-30: %i é revogada, sem relato', async (status) => {
    const c = await cenario();
    c.servico.responder(status);
    expect(await c.enviar()).toEqual({ classe: 'revogada' });
    expect(c.relatos).toEqual([]);
    c.esperaSemSegredo();
  });

  it.each([429, 500, 502, 503])('NOT-31: %i é tentarDeNovo, sem Retry-After', async (status) => {
    const c = await cenario();
    c.servico.responder(status);
    expect(await c.enviar()).toEqual({ classe: 'tentarDeNovo' });
    expect(c.relatos).toEqual([]);
    c.esperaSemSegredo();
  });

  it('NOT-31: 429 com Retry-After em segundos', async () => {
    const c = await cenario();
    c.servico.responder({ status: 429, cabecalhos: { 'Retry-After': '120' } });
    expect(await c.enviar()).toEqual({ classe: 'tentarDeNovo', aposSegundos: 120 });
  });

  it('NOT-31: 503 com Retry-After em data HTTP', async () => {
    const c = await cenario();
    c.servico.responder({
      status: 503,
      cabecalhos: { 'Retry-After': 'Thu, 05 Nov 2026 12:02:00 GMT' },
    });
    expect(await c.enviar()).toEqual({ classe: 'tentarDeNovo', aposSegundos: 120 });
  });

  it.each([400, 403, 413])('NOT-32: %i é erro, reportado só com host e status', async (status) => {
    const c = await cenario();
    c.servico.responder(status);
    expect(await c.enviar()).toEqual({ classe: 'erro' });
    expect(c.relatos).toEqual([{ host: 'fcm.googleapis.com', status, motivo: 'status' }]);
    c.esperaSemSegredo();
  });

  it.each([200, 202, 301, 401, 405])(
    '[LACUNA] %i fora da spec é erro reportado, sem apagar',
    async (status) => {
      const c = await cenario();
      c.servico.responder(status);
      expect(await c.enviar()).toEqual({ classe: 'erro' });
      expect(c.relatos).toEqual([{ host: 'fcm.googleapis.com', status, motivo: 'status' }]);
    },
  );

  it('[LACUNA] fetch que lança é tentarDeNovo, sem relato e sem segredo no console', async () => {
    const c = await cenario();
    const r = await enviarPush(c.a, PAYLOAD, {
      vapid: c.chaves,
      topico: TOPICO,
      ttl: TTL_RANKING,
      agora: AGORA,
      fetch: (async () => {
        throw new TypeError(`falha de rede em ${ENDPOINT}`);
      }) as typeof fetch,
      reportar: (x) => c.relatos.push(x),
    });
    expect(r).toEqual({ classe: 'tentarDeNovo' });
    expect(c.relatos).toEqual([]);
    c.esperaSemSegredo();
  });

  it('NOT-33: payload grande é erro sem fetch e o relato não leva o payload', async () => {
    const c = await cenario();
    const r = await enviarPush(c.a, 'x'.repeat(4000), {
      vapid: c.chaves,
      topico: TOPICO,
      ttl: TTL_RANKING,
      agora: AGORA,
      fetch: c.servico.fetch,
      reportar: (x) => c.relatos.push(x),
    });
    expect(r).toEqual({ classe: 'erro' });
    expect(c.servico.pedidos).toHaveLength(0);
    expect(c.relatos).toEqual([
      { host: 'fcm.googleapis.com', status: 0, motivo: 'payload_grande' },
    ]);
    c.esperaSemSegredo();
  });
});

describe('segundosDoRetryAfter', () => {
  it.each([
    ['0', 0],
    ['60', 60],
    ['Thu, 05 Nov 2026 12:00:30 GMT', 30],
    ['Thu, 05 Nov 2026 11:00:00 GMT', 0],
    ['-5', undefined],
    ['1.5', undefined],
    ['amanhã', undefined],
    ['', undefined],
  ])('%j dá %s', (valor, esperado) => {
    expect(segundosDoRetryAfter(valor, AGORA)).toBe(esperado);
  });

  it('sem cabeçalho dá undefined', () => {
    expect(segundosDoRetryAfter(null, AGORA)).toBeUndefined();
  });
});
