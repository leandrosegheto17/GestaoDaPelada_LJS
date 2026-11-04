import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const raiz = join(import.meta.dirname, '..', '..', '..');

async function lintar(codigo: string) {
  const eslint = new ESLint({ cwd: raiz });
  const [r] = await eslint.lintText(codigo, {
    filePath: join(raiz, 'backend/dominio/src/exemplo.ts'),
  });
  return r!.messages;
}

describe('domínio sem I/O', () => {
  test('FUN-06: importar node:fs no domínio é erro do ESLint', async () => {
    const msgs = await lintar(
      "import { readFileSync } from 'node:fs';\nexport const f = readFileSync;\n",
    );
    expect(msgs.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  test('FUN-06: arquivo sem I/O não gera erro', async () => {
    const msgs = await lintar('export const soma = (a: number, b: number) => a + b;\n');
    expect(msgs).toEqual([]);
  });
});
