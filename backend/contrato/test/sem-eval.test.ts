import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

// FUN-28: o app roda sob CSP `script-src 'self'` (sem `unsafe-eval`). O Zod 4 testa `Function('')` ao montar um
// schema de objeto (para decidir se compila o validador) e o navegador registra `securitypolicyviolation` mesmo com
// o erro engolido. O contrato é carregado pelo front: nem montar nem validar os schemas pode chamar `Function`.
describe('contrato sem eval (FUN-28)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('carregar o contrato e validar um objeto não chama Function', async () => {
    vi.resetModules();
    const espiao = vi.spyOn(globalThis, 'Function');
    const { sessaoEu, cadastroCorpo } = await import('../src/index.ts');
    expect(sessaoEu.safeParse({ id: 'u1', nome: 'Ana', email: 'ana@exemplo.com', grupos: [] }).success).toBe(true);
    expect(cadastroCorpo.safeParse({}).success).toBe(false);
    expect(espiao).not.toHaveBeenCalled();
  });

  it("nenhum módulo do contrato importa 'zod' direto (só src/zod.ts, que liga o jitless)", () => {
    const pasta = new URL('../src/', import.meta.url);
    const diretos = readdirSync(pasta)
      .filter((nome) => nome.endsWith('.ts') && nome !== 'zod.ts')
      .filter((nome) => /from ['"]zod(?:\/[^'"]*)?['"]/.test(readFileSync(new URL(nome, pasta), 'utf8')));
    expect(diretos).toEqual([]);
  });
});
