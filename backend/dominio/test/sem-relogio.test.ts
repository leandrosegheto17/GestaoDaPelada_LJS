import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * Domínio sem relógio e sem zod (T7; GEL-70, GEL-104, AD-028). Estende a regra do domínio sem I/O da fundação
 * (`sem-io.test.ts`, FUN-06): `Date.now()`, `new Date()` sem argumento e `performance.now()` reprovam pelo
 * `no-restricted-syntax`; o import de `zod` reprova pelo `no-restricted-imports`.
 */

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const ARQUIVO = join(RAIZ, 'backend', 'dominio', 'src', 'exemplo-sem-relogio.ts');

async function mensagensDe(codigo: string, regra: string) {
  const eslint = new ESLint({ cwd: RAIZ });
  const [resultado] = await eslint.lintText(codigo, { filePath: ARQUIVO });
  return (resultado?.messages ?? []).filter((m) => m.ruleId === regra);
}

describe('domínio sem relógio', () => {
  it('GEL-70: Date.now() no domínio reprova', async () => {
    const erros = await mensagensDe('export const agora = (): number => Date.now();\n', 'no-restricted-syntax');
    expect(erros).toHaveLength(1);
    expect(erros[0]?.message).toContain('GEL-70');
  });

  it('GEL-70: new Date() sem argumento no domínio reprova', async () => {
    const erros = await mensagensDe('export const hoje = (): Date => new Date();\n', 'no-restricted-syntax');
    expect(erros).toHaveLength(1);
    expect(erros[0]?.message).toContain('GEL-70');
  });

  it('GEL-70: performance.now() no domínio reprova', async () => {
    const erros = await mensagensDe('export const t = (): number => performance.now();\n', 'no-restricted-syntax');
    expect(erros).toHaveLength(1);
  });

  it("GEL-70: new Date('2026-01-01') (data dada) passa", async () => {
    const erros = await mensagensDe("export const d = (): Date => new Date('2026-01-01');\n", 'no-restricted-syntax');
    expect(erros).toHaveLength(0);
  });
});

describe('domínio sem zod', () => {
  it("GEL-104: import { z } from 'zod' no domínio reprova", async () => {
    const erros = await mensagensDe("import { z } from 'zod';\nexport const s = z.string();\n", 'no-restricted-imports');
    expect(erros).toHaveLength(1);
    expect(erros[0]?.message).toContain('GEL-104');
  });

  it('GEL-104: arquivo puro, sem relógio e sem zod, passa', async () => {
    const codigo = 'export const dobro = (n: number): number => n * 2;\n';
    expect(await mensagensDe(codigo, 'no-restricted-imports')).toHaveLength(0);
    expect(await mensagensDe(codigo, 'no-restricted-syntax')).toHaveLength(0);
  });
});
