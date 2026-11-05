import * as Sentry from '@sentry/react';
import { limparEvento } from '@pelada/contrato/sentry';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { iniciarObservabilidade, opcoesSentry } from '../../src/app/observabilidade.ts';
import type { OpcoesSentryFront } from '../../src/app/observabilidade.ts';

/**
 * Sentry no front (FUN-24, FUN-25): sem `VITE_SENTRY_DSN` nada é inicializado e nada sai; com
 * DSN, a configuração usa `release` igual ao SHA e o `beforeSend` de `limparEvento`.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Sentry no front', () => {
  for (const [caso, env] of [
    ['sem a variável', {}],
    ['com DSN vazio', { VITE_SENTRY_DSN: '' }],
    ['com DSN só de espaços', { VITE_SENTRY_DSN: '   ' }],
  ] as const) {
    it(`FUN-25: ${caso}, o Sentry não é inicializado`, () => {
      const iniciar = vi.fn();
      expect(iniciarObservabilidade({ ...env, VITE_VERSAO: 'sha-x' }, iniciar)).toBe(false);
      expect(iniciar).not.toHaveBeenCalled();
    });
  }

  it('FUN-25: sem DSN, com o Sentry de verdade, nenhum cliente nasce e nenhuma requisição sai', () => {
    const buscar = vi.fn(() => Promise.reject(new Error('nenhuma requisição deveria sair')));
    const beacon = vi.fn(() => true);
    vi.stubGlobal('fetch', buscar);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: beacon });

    expect(iniciarObservabilidade({ VITE_VERSAO: 'sha-x' })).toBe(false);
    Sentry.captureException(new Error('erro sem DSN'));

    expect(Sentry.getClient()).toBeUndefined();
    expect(buscar).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('FUN-24: com DSN falso, a configuração usa release igual ao SHA e o beforeSend de limparEvento', () => {
    const recebidas: OpcoesSentryFront[] = [];
    const ligado = iniciarObservabilidade(
      { VITE_SENTRY_DSN: 'https://chave@o0.ingest.sentry.io/0', VITE_VERSAO: 'sha-abc123' },
      (opcoes) => recebidas.push(opcoes),
    );
    expect(ligado).toBe(true);
    expect(recebidas).toHaveLength(1);
    expect(recebidas[0]?.dsn).toBe('https://chave@o0.ingest.sentry.io/0');
    expect(recebidas[0]?.release).toBe('sha-abc123');
    expect(recebidas[0]?.beforeSend).toBe(limparEvento);
    expect(recebidas[0]?.sendDefaultPii).toBe(false);
  });

  it('FUN-24: o beforeSend configurado tira cookie, authorization e e-mail do evento', () => {
    const { beforeSend } = opcoesSentry({ VITE_SENTRY_DSN: 'https://chave@o0.ingest.sentry.io/0', VITE_VERSAO: 'v' });
    const limpo = beforeSend({
      message: 'falha para ana@exemplo.com',
      request: { data: '{"senha":"x"}', cookies: { s: '1' }, headers: { Cookie: 'a=1', Authorization: 'Bearer t', Accept: '*/*' } },
    });
    expect(limpo.message).not.toContain('ana@exemplo.com');
    expect(limpo.request).not.toHaveProperty('data');
    expect(limpo.request).not.toHaveProperty('cookies');
    expect(limpo.request.headers).toEqual({ Accept: '*/*' });
  });
});
