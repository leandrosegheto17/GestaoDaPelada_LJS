import { env, exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configurarSentry } from '../../src/entrada/observabilidade.ts';

afterEach(() => vi.restoreAllMocks());

describe('Sentry no Worker', () => {
  it('FUN-25: sem SENTRY_DSN o Worker responde normalmente e nenhuma chamada de rede sai', async () => {
    expect(env.SENTRY_DSN).toBeUndefined();
    const rede = vi.spyOn(globalThis, 'fetch');
    const r = await exports.default.fetch('http://pelada.test/api/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'ok', versao: env.VERSAO });
    expect(rede).not.toHaveBeenCalled();
  });

  it('FUN-25: sem DSN, a configuração do Sentry não tem dsn (o SDK fica desligado)', () => {
    expect(configurarSentry(env).dsn).toBeUndefined();
    expect(configurarSentry({ ...env, SENTRY_DSN: '' }).dsn).toBeUndefined();
  });

  it('FUN-24: com DSN, release é a VERSAO e o beforeSend limpa o evento', async () => {
    const config = configurarSentry({
      ...env,
      SENTRY_DSN: 'https://chave@o1.ingest.sentry.io/1',
      VERSAO: 'abc1234',
    });
    expect(config.dsn).toBe('https://chave@o1.ingest.sentry.io/1');
    expect(config.release).toBe('abc1234');
    const saida = await config.beforeSend?.(
      {
        type: undefined,
        message: 'falhou para maria@exemplo.com',
        request: { data: 'corpo', headers: { authorization: 'Bearer x', accept: '*/*' } },
      },
      {},
    );
    expect(JSON.stringify(saida)).not.toMatch(/maria@exemplo|corpo|Bearer/);
    expect(saida).toMatchObject({ request: { headers: { accept: '*/*' } } });
  });

  it('FUN-24: com DSN o Worker segue respondendo a saúde', async () => {
    const r = await exports.default.fetch('http://pelada.test/api/health');
    expect(r.status).toBe(200);
  });
});
