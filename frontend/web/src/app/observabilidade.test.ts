import type { ErrorEvent } from '@sentry/react';
import { init } from '@sentry/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { iniciarObservabilidade, limparEvento, opcoesSentry } from './observabilidade';

vi.mock('@sentry/react', () => ({ init: vi.fn() }));

const DSN = 'https://chave@sentry.exemplo.invalid/1';
const EMAIL = 'fulano@exemplo.com.br';

afterEach(() => vi.clearAllMocks());

// FUN-24
describe('sem VITE_SENTRY_DSN', () => {
  it.each([undefined, ''])('DSN %j: não inicializa o SDK', (dsn) => {
    expect(iniciarObservabilidade({ VITE_SENTRY_DSN: dsn })).toBe(false);
    expect(init).not.toHaveBeenCalled();
    expect(opcoesSentry({ VITE_SENTRY_DSN: dsn })).toMatchObject({ enabled: false });
  });
});

// FUN-23
describe('com VITE_SENTRY_DSN', () => {
  it('inicializa com o DSN, release = SHA e sem PII padrão', () => {
    expect(iniciarObservabilidade({ VITE_SENTRY_DSN: DSN, VITE_VERSAO: 'abc123' })).toBe(true);
    expect(init).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        enabled: true,
        release: 'abc123',
        dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false },
        beforeSend: limparEvento,
      }),
    );
  });
});

describe('limparEvento (beforeSend)', () => {
  const evento = (): ErrorEvent => ({
    type: undefined,
    message: `erro de ${EMAIL}`,
    exception: { values: [{ type: 'Error', value: `falhou para ${EMAIL.toUpperCase()}` }] },
    breadcrumbs: [{ message: `log com ${EMAIL}`, data: { para: EMAIL, n: 1 } }],
    user: { email: EMAIL },
    request: {
      url: `https://app.invalid/x?email=${EMAIL}`,
      query_string: `email=${EMAIL}`,
      data: { senha: 'segredo' },
      cookies: { sessao: 'segredo' },
      headers: { Cookie: 'sessao=segredo', authorization: 'Bearer segredo', 'X-Pelada': '1' },
    },
  });

  it('remove corpo, cookies, Cookie e Authorization', () => {
    const { request } = limparEvento(evento());
    expect(request).not.toHaveProperty('data');
    expect(request).not.toHaveProperty('cookies');
    expect(request?.headers).toEqual({ 'X-Pelada': '1' });
  });

  it('troca e-mails por [email removido] em todo o evento', () => {
    const limpo = JSON.stringify(limparEvento(evento()));
    expect(limpo).not.toMatch(/fulano|exemplo\.com\.br/i);
    expect(limpo).toContain('[email removido]');
  });

  it('troca também o e-mail com @ codificado na URL', () => {
    const limpo = limparEvento({
      ...evento(),
      request: { url: 'https://app.invalid/x?email=fulano%40exemplo.com.br' },
    });
    expect(limpo.request?.url).toBe('https://app.invalid/x?email=[email removido]');
  });

  it('não altera o evento original', () => {
    const original = evento();
    limparEvento(original);
    expect(original.request?.data).toEqual({ senha: 'segredo' });
  });
});
