import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { EMAIL, DSN, espiarRede, eventosDe, requisicaoQueFalha } from '../apoio/sentry.ts';

// O que sai para a rede quando há DSN: o `fetch` global é espiado e nada chega ao Sentry de verdade.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sentry com SENTRY_DSN (FUN-23)', () => {
  it('o erro sai com release = SHA e sem corpo, cookies, Authorization e e-mails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { chamadas } = espiarRede();
    const r = await requisicaoQueFalha({ ...env, SENTRY_DSN: DSN, VERSAO: 'sha-do-commit' });
    expect(r.status).toBe(500);

    const paraOSentry = chamadas.filter((c) => c.url.includes('sentry.invalid'));
    expect(paraOSentry.length).toBeGreaterThan(0);
    const eventos = paraOSentry.flatMap((c) => eventosDe(c.corpo));
    expect(eventos.length).toBeGreaterThan(0);
    const tudo = paraOSentry.map((c) => c.corpo).join('\n');
    for (const evento of eventos) expect(evento.release).toBe('sha-do-commit');
    expect(tudo).not.toContain(EMAIL);
    expect(tudo).not.toContain(encodeURIComponent(EMAIL));
    expect(tudo).not.toContain('segredo-do-cookie');
    expect(tudo).not.toContain('segredo-do-token');
    expect(tudo).not.toContain('segredo-da-senha');
  });
});
