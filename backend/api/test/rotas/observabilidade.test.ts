import { limparEvento } from '@pelada/contrato/sentry';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import {
  criarWorker,
  opcoesSentry,
  type EmbrulharSentry,
  type Manipulador,
  type OpcoesSentry,
} from '../../src/entrada/observabilidade.ts';
import worker from '../../src/entrada/worker.ts';

const permite = { limit: async () => ({ success: true }) };

function env(extra: Partial<Env> = {}): Env {
  return {
    VERSAO: 'sha-observabilidade',
    URL_PUBLICA: '',
    HYPERDRIVE: { connectionString: '' },
    LIMITE_ENTRAR: permite,
    LIMITE_PUBLICO: permite,
    LIMITE_WEBHOOK: permite,
    LIMITE_ESCRITA: permite,
    ...extra,
  } as unknown as Env;
}

const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} };

/** App com uma rota que lança: é o caso em que o Sentry mandaria um evento. */
function appComErro(): Manipulador {
  const app = criarApp({
    registrarExtras: (api) =>
      api.get('/teste/erro', () => {
        throw new Error('falha para o sentry');
      }),
  });
  return { fetch: (r, e, c) => app.fetch(r, e, c as Parameters<typeof app.fetch>[2]) };
}

/** `withSentry` falso: guarda as opções e conta as requisições que passaram por ele. */
function embrulharFalso() {
  const registro = { opcoes: [] as OpcoesSentry[], passaram: 0 };
  const embrulhar: EmbrulharSentry = (opcoes, manipulador) => ({
    fetch: (r, e, c) => {
      registro.passaram += 1;
      registro.opcoes.push(opcoes(e));
      return manipulador.fetch(r, e, c);
    },
  });
  return { embrulhar, registro };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sentry no Worker', () => {
  it('FUN-25: sem SENTRY_DSN, o Worker responde normalmente e nenhuma chamada de rede sai', async () => {
    const espiao = vi.spyOn(globalThis, 'fetch');
    const r = await worker.fetch(new Request('https://app.test/api/health'), env(), ctx);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'ok', versao: 'sha-observabilidade' });
    const comErro = await criarWorker(appComErro()).fetch(
      new Request('https://app.test/api/teste/erro'),
      env(),
      ctx,
    );
    expect(comErro.status).toBe(500);
    expect(espiao).not.toHaveBeenCalled();
  });

  it('FUN-25: sem SENTRY_DSN (ausente, vazio ou só espaços), a requisição não passa pelo Sentry', async () => {
    const { embrulhar, registro } = embrulharFalso();
    const w = criarWorker(appComErro(), embrulhar);
    for (const extra of [{}, { SENTRY_DSN: '' }, { SENTRY_DSN: '   ' }]) {
      const r = await w.fetch(new Request('https://app.test/api/health'), env(extra), ctx);
      expect(r.status).toBe(200);
    }
    expect(registro.passaram).toBe(0);
  });

  it('FUN-24: com DSN falso, a requisição passa pelo Sentry com release igual a VERSAO e o beforeSend de limparEvento', async () => {
    const { embrulhar, registro } = embrulharFalso();
    const w = criarWorker(appComErro(), embrulhar);
    const dsn = 'https://chave@o0.ingest.exemplo.test/1';
    const r = await w.fetch(
      new Request('https://app.test/api/health'),
      env({ SENTRY_DSN: dsn }),
      ctx,
    );
    expect(r.status).toBe(200);
    expect(registro.passaram).toBe(1);
    const opcoes = registro.opcoes[0];
    expect(opcoes?.dsn).toBe(dsn);
    expect(opcoes?.release).toBe('sha-observabilidade');
    expect(opcoes?.sendDefaultPii).toBe(false);
    expect(opcoes?.beforeSend).toBe(limparEvento);
  });

  it('FUN-24: o beforeSend das opções tira e-mail e cabeçalho authorization do evento', () => {
    const opcoes = opcoesSentry(env({ SENTRY_DSN: 'https://chave@o0.ingest.exemplo.test/1' }));
    const evento = opcoes.beforeSend({
      message: 'erro de fulano@exemplo.com',
      request: { headers: { authorization: 'Bearer x' } },
    });
    expect(JSON.stringify(evento)).not.toContain('fulano@exemplo.com');
    expect(JSON.stringify(evento)).not.toContain('Bearer x');
  });
});
