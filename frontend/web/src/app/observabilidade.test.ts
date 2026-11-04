import { describe, expect, test, vi } from 'vitest';
import { configurarSentry, iniciarSentry } from './observabilidade.ts';

describe('Sentry no front', () => {
  test('FUN-25: sem DSN, nada é inicializado e nenhuma requisição sai', () => {
    const init = vi.fn();
    const rede = vi.spyOn(globalThis, 'fetch');
    expect(iniciarSentry({}, init)).toBe(false);
    expect(iniciarSentry({ VITE_SENTRY_DSN: '   ' }, init)).toBe(false);
    expect(init).not.toHaveBeenCalled();
    expect(rede).not.toHaveBeenCalled();
    expect(configurarSentry({}).dsn).toBeUndefined();
    rede.mockRestore();
  });

  test('FUN-24: com DSN falso, a configuração usa release e limparEvento', async () => {
    const init = vi.fn();
    const env = { VITE_SENTRY_DSN: 'https://chave@o1.ingest.sentry.io/1', VITE_VERSAO: 'abc1234' };
    expect(iniciarSentry(env, init)).toBe(true);
    const config = init.mock.calls[0]?.[0] as ReturnType<typeof configurarSentry>;
    expect(config.dsn).toBe(env.VITE_SENTRY_DSN);
    expect(config.release).toBe('abc1234');
    const saida = await config.beforeSend?.(
      { type: undefined, message: 'erro de maria@exemplo.com', request: { data: 'corpo' } },
      {},
    );
    expect(JSON.stringify(saida)).not.toMatch(/maria@exemplo|corpo/);
  });
});
