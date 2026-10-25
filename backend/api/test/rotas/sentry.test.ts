import type { ErrorEvent } from '@sentry/cloudflare';
import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { limparEvento, opcoesSentry } from '../../src/entrada/sentry.ts';
import { DSN, EMAIL, espiarRede, requisicaoQueFalha } from '../apoio/sentry.ts';

// O envio de verdade, com DSN, fica em sentry-com-dsn.test.ts.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sentry no Worker (FUN-23, FUN-24)', () => {
  describe('sem SENTRY_DSN', () => {
    it('o app funciona e nada vai para a rede, nem com erro', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const { chamadas } = espiarRede();
      const r = await requisicaoQueFalha({ ...env, SENTRY_DSN: undefined });
      expect(r.status).toBe(500);
      const health = await criarApp().request('/api/health', {}, { ...env, SENTRY_DSN: undefined });
      expect(health.status).toBe(200);
      expect(chamadas).toEqual([]);
    });

    it.each([undefined, ''])('SENTRY_DSN %j deixa o SDK desligado', (dsn) => {
      expect(opcoesSentry({ ...env, SENTRY_DSN: dsn })).toMatchObject({ enabled: false });
    });
  });

  describe('com SENTRY_DSN', () => {
    it('opções: DSN do ambiente, release = VERSAO, sem PII padrão', () => {
      const opcoes = opcoesSentry({ ...env, SENTRY_DSN: DSN, VERSAO: 'abc123' });
      expect(opcoes).toMatchObject({
        dsn: DSN,
        enabled: true,
        release: 'abc123',
        dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false },
      });
      expect(opcoes.beforeSend).toBe(limparEvento);
    });
  });

  describe('limparEvento (beforeSend)', () => {
    const evento = (): ErrorEvent => ({
      type: undefined,
      message: `erro de ${EMAIL}`,
      exception: { values: [{ type: 'Error', value: `falhou para ${EMAIL.toUpperCase()}` }] },
      breadcrumbs: [
        { message: `log com ${EMAIL}`, data: { para: EMAIL, n: 1 } },
        { category: 'fetch', data: { url: `https://x.invalid/?e=${EMAIL}` } },
      ],
      request: {
        url: `https://app.invalid/api/x?email=${EMAIL}`,
        query_string: `email=${EMAIL}`,
        data: { senha: 'segredo' },
        cookies: { sessao: 'segredo' },
        headers: { Cookie: 'sessao=segredo', authorization: 'Bearer segredo', 'X-Pelada': '1' },
      },
      user: { email: EMAIL, id: 'conta-1' },
      extra: { lista: [EMAIL, 'ok'] },
    });

    it('remove corpo, cookies e os cabeçalhos Cookie e Authorization (qualquer caixa)', () => {
      const limpo = limparEvento(evento());
      expect(limpo?.request?.data).toBeUndefined();
      expect(limpo?.request?.cookies).toBeUndefined();
      expect(limpo?.request?.headers).toEqual({ 'X-Pelada': '1' });
    });

    it('troca e-mails em mensagem, exceção, breadcrumbs, URL, usuário e extras', () => {
      const limpo = limparEvento(evento());
      expect(JSON.stringify(limpo)).not.toMatch(/fulano\.silva@exemplo\.com/i);
      expect(limpo?.message).toBe('erro de [email removido]');
      expect(limpo?.breadcrumbs?.[0]?.data).toEqual({ para: '[email removido]', n: 1 });
      expect(limpo?.user).toEqual({ email: '[email removido]', id: 'conta-1' });
    });

    it('também pega e-mail codificado na URL', () => {
      const e = evento();
      if (e.request) e.request.query_string = `email=${encodeURIComponent(EMAIL)}`;
      expect(JSON.stringify(limparEvento(e))).not.toContain(encodeURIComponent(EMAIL));
    });

    it('evento sem request nem breadcrumbs passa sem quebrar', () => {
      expect(limparEvento({ type: undefined, message: 'sem dados' })).toEqual({
        type: undefined,
        message: 'sem dados',
      });
    });
  });
});
