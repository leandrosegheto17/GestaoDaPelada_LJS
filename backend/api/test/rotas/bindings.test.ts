import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

// Roda dentro do workerd (@cloudflare/vitest-plugin), com os bindings lidos do wrangler.jsonc da raiz.
describe('bindings do Worker no workerd (FUN-19, FUN-26)', () => {
  it.each(['LIMITE_ENTRAR', 'LIMITE_PUBLICO', 'LIMITE_WEBHOOK'] as const)(
    '%s é um limitador utilizável',
    async (nome) => {
      const limitador = env[nome];
      expect(limitador).toBeDefined();
      const { success } = await (limitador as RateLimit).limit({ key: `teste-${nome}` });
      expect(success).toBe(true);
    },
  );

  it('HYPERDRIVE entrega uma string de conexão Postgres', () => {
    expect(env.HYPERDRIVE.connectionString).toMatch(/^postgres(ql)?:\/\//);
  });

  it('as variáveis do wrangler.jsonc chegam ao Worker', () => {
    expect(env.URL_PUBLICA).toBe('http://localhost:8787');
    expect(env.VERSAO).toBeTruthy();
  });
});
