import { describe, expect, it } from 'vitest';
import {
  assinaturaPushCorpo,
  cancelarPushCorpo,
  CODIGO_LIMITE_ASSINATURAS,
  CODIGO_PUSH_INDISPONIVEL,
  criarAssinaturaPushCorpo,
  deBase64url,
  endpointPushAceito,
  hostsPushDev,
  MENSAGEM_CHAVE,
  MENSAGEM_ENDPOINT,
  paraBase64url,
} from '../src/push.ts';

/** Contrato da assinatura de push (T1; NOT-06, NOT-67; AD-066, AD-109). */

function bytes(n: number, primeiro = 1): Uint8Array {
  const b = new Uint8Array(n).fill(7);
  b[0] = primeiro;
  return b;
}

const P256DH = paraBase64url(bytes(65, 0x04));
const AUTH = paraBase64url(bytes(16));
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

const corpo = (sobre: Record<string, unknown> = {}, chaves: Record<string, unknown> = {}) => ({
  endpoint: ENDPOINT,
  chaves: { p256dh: P256DH, auth: AUTH, ...chaves },
  ...sobre,
});

function campos(resultado: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return (resultado.error?.issues ?? []).map((i) => ({
    campo: i.path.map(String).join('.'),
    mensagem: i.message,
  }));
}

describe('base64url', () => {
  it('ida e volta preserva os bytes', () => {
    const original = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);
    const texto = paraBase64url(original);
    expect(texto).not.toMatch(/[+/=]/);
    expect(deBase64url(texto)).toEqual(original);
  });

  it.each(['ab+c', 'ab/c', 'abc=', 'a', 'é'])('NOT-06: %j não é base64url válido', (texto) => {
    expect(deBase64url(texto)).toBeNull();
  });
});

describe('assinaturaPushCorpo: hosts', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGx',
    'https://api.push.apple.com/x',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://FCM.GOOGLEAPIS.COM/fcm/send/abc',
  ])('NOT-06: host da lista aceito: %s', (endpoint) => {
    expect(assinaturaPushCorpo.safeParse(corpo({ endpoint })).success).toBe(true);
  });

  it.each([
    ['http', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['host parecido', 'https://fcm.googleapis.com.mal.example/fcm/send/abc'],
    ['sufixo sem ponto', 'https://malpush.apple.com/x'],
    ['push.apple.com sem subdomínio', 'https://push.apple.com/x'],
    ['host fora da lista', 'https://exemplo.com/push'],
    ['porta', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
    ['porta padrão explícita', 'https://fcm.googleapis.com:443/fcm/send/abc'],
    ['usuário na URL', 'https://user@fcm.googleapis.com/fcm/send/abc'],
    ['usuário e senha na URL', 'https://user:senha@fcm.googleapis.com/fcm/send/abc'],
    ['IPv4', 'https://142.250.0.1/fcm/send/abc'],
    ['IPv6', 'https://[::1]/fcm/send/abc'],
    ['acima de 1024', `https://fcm.googleapis.com/${'a'.repeat(1024)}`],
    ['vazio', ''],
    ['não URL', 'fcm.googleapis.com/fcm/send/abc'],
  ])('NOT-06: %s recusado no campo endpoint', (_caso, endpoint) => {
    expect(campos(assinaturaPushCorpo.safeParse(corpo({ endpoint })))).toEqual([
      { campo: 'endpoint', mensagem: MENSAGEM_ENDPOINT },
    ]);
  });

  it('NOT-06: endpoint que não é texto recusado no campo', () => {
    expect(campos(assinaturaPushCorpo.safeParse(corpo({ endpoint: 42 })))[0]?.campo).toBe(
      'endpoint',
    );
  });

  it('NOT-06: 1024 caracteres no limite é aceito', () => {
    const base = 'https://fcm.googleapis.com/';
    const endpoint = base + 'a'.repeat(1024 - base.length);
    expect(endpoint).toHaveLength(1024);
    expect(endpointPushAceito(endpoint)).toBe(true);
  });

  it('NOT-06: host extra (PUSH_HOSTS_DEV) só vale quando passado', () => {
    const endpoint = 'https://push-falso.localhost/x';
    expect(assinaturaPushCorpo.safeParse(corpo({ endpoint })).success).toBe(false);
    expect(
      criarAssinaturaPushCorpo(['push-falso.localhost']).safeParse(corpo({ endpoint })).success,
    ).toBe(true);
  });
});

describe('assinaturaPushCorpo: chaves', () => {
  it.each([
    ['p256dh comprimido de 33 bytes', { p256dh: paraBase64url(bytes(33, 0x02)) }, 'chaves.p256dh'],
    ['p256dh de 65 bytes sem 0x04', { p256dh: paraBase64url(bytes(65, 0x05)) }, 'chaves.p256dh'],
    [
      'p256dh em base64 comum',
      { p256dh: btoa(String.fromCharCode(...bytes(65, 0x04))) + '+/' },
      'chaves.p256dh',
    ],
    ['auth de 15 bytes', { auth: paraBase64url(bytes(15)) }, 'chaves.auth'],
    ['auth de 17 bytes', { auth: paraBase64url(bytes(17)) }, 'chaves.auth'],
    ['auth com preenchimento', { auth: `${AUTH}==` }, 'chaves.auth'],
    ['auth vazio', { auth: '' }, 'chaves.auth'],
    ['auth não texto', { auth: null }, 'chaves.auth'],
  ])('NOT-06: %s recusado no campo', (_caso, chaves, campo) => {
    expect(campos(assinaturaPushCorpo.safeParse(corpo({}, chaves)))).toEqual([
      { campo, mensagem: MENSAGEM_CHAVE },
    ]);
  });

  it('NOT-06: corpo válido sai igual', () => {
    expect(assinaturaPushCorpo.parse(corpo())).toEqual(corpo());
  });

  it('NOT-06: campo a mais na raiz é recusado', () => {
    expect(assinaturaPushCorpo.safeParse(corpo({ expirationTime: null })).success).toBe(false);
  });

  it('NOT-06: campo a mais nas chaves é recusado', () => {
    expect(assinaturaPushCorpo.safeParse(corpo({}, { extra: 'x' })).success).toBe(false);
  });

  it('NOT-06: sem as chaves é recusado', () => {
    expect(assinaturaPushCorpo.safeParse({ endpoint: ENDPOINT }).success).toBe(false);
  });
});

describe('corpo que não é objeto', () => {
  it.each([null, 'texto', 42, [], true])('NOT-67: %j recusado', (valor) => {
    expect(assinaturaPushCorpo.safeParse(valor).success).toBe(false);
    expect(cancelarPushCorpo.safeParse(valor).success).toBe(false);
  });
});

describe('cancelarPushCorpo', () => {
  it('NOT-06: aceita endpoint e auth', () => {
    expect(cancelarPushCorpo.parse({ endpoint: ENDPOINT, chaves: { auth: AUTH } })).toEqual({
      endpoint: ENDPOINT,
      chaves: { auth: AUTH },
    });
  });

  it('NOT-06: o p256dh a mais é recusado e o host fora da lista também', () => {
    expect(
      cancelarPushCorpo.safeParse({ endpoint: ENDPOINT, chaves: { auth: AUTH, p256dh: P256DH } })
        .success,
    ).toBe(false);
    expect(
      cancelarPushCorpo.safeParse({ endpoint: 'https://exemplo.com/x', chaves: { auth: AUTH } })
        .success,
    ).toBe(false);
  });
});

describe('códigos de erro', () => {
  it('push_indisponivel e limite_assinaturas', () => {
    expect(CODIGO_PUSH_INDISPONIVEL).toBe('push_indisponivel');
    expect(CODIGO_LIMITE_ASSINATURAS).toBe('limite_assinaturas');
  });
});

describe('PUSH_HOSTS_DEV (T27)', () => {
  it('NOT-63: sem PUSH_HOSTS_DEV, localhost é recusado, com http ou https e com ou sem porta', () => {
    for (const endpoint of [
      'http://localhost:8790/push/a',
      'https://localhost/push/a',
      'http://127.0.0.1:8790/push/a',
    ]) {
      expect(endpointPushAceito(endpoint), endpoint).toBe(false);
      expect(endpointPushAceito(endpoint, hostsPushDev(undefined)), endpoint).toBe(false);
      expect(endpointPushAceito(endpoint, hostsPushDev('')), endpoint).toBe(false);
    }
  });

  it('NOT-63: com ela, aceita http e https em localhost só no host e na porta listados', () => {
    const extras = hostsPushDev(' localhost:8790 , Push-Falso.localhost ');
    expect(extras).toEqual(['localhost:8790', 'push-falso.localhost']);
    expect(endpointPushAceito('http://localhost:8790/push/a', extras)).toBe(true);
    expect(endpointPushAceito('https://push-falso.localhost/x', extras)).toBe(true);
    expect(endpointPushAceito('http://localhost:8791/push/a', extras)).toBe(false);
    expect(endpointPushAceito('http://localhost/push/a', extras)).toBe(false);
    expect(endpointPushAceito('http://usuario@localhost:8790/push/a', extras)).toBe(false);
  });

  it('NOT-63: aceita só em localhost: outro host na variável é ignorado', () => {
    const extras = hostsPushDev(
      'mal.example:8790,mal.example,127.0.0.1:8790,localhost.mal.example',
    );
    expect(extras).toEqual([]);
    for (const endpoint of [
      'http://mal.example:8790/x',
      'https://mal.example/x',
      'http://127.0.0.1:8790/x',
      'https://localhost.mal.example/x',
    ]) {
      expect(
        endpointPushAceito(endpoint, [
          'mal.example:8790',
          'mal.example',
          '127.0.0.1:8790',
          'localhost.mal.example',
        ]),
      ).toBe(false);
    }
  });

  it('NOT-63: os hosts reais continuam aceitos com a variável e o teto de 1024 vale para o de dev', () => {
    const extras = hostsPushDev('localhost:8790');
    expect(endpointPushAceito(ENDPOINT, extras)).toBe(true);
    const base = 'http://localhost:8790/';
    expect(endpointPushAceito(base + 'a'.repeat(1025 - base.length), extras)).toBe(false);
  });
});
