import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

const raiz = resolve(import.meta.dirname, '../../..');
const eslint = new ESLint({ cwd: raiz });

async function mensagens(codigo: string) {
  const [resultado] = await eslint.lintText(codigo, {
    filePath: resolve(raiz, 'backend/dominio/src/exemplo.ts'),
  });
  return resultado?.messages ?? [];
}

test('FUN-06: import de node:fs no domínio é reportado pelo ESLint', async () => {
  const msgs = await mensagens(
    "import { readFileSync } from 'node:fs';\nexport const f = readFileSync;\n",
  );
  expect(msgs.map((m) => m.ruleId)).toContain('no-restricted-imports');
});

test('FUN-06: domínio sem I/O não tem nenhum erro', async () => {
  const msgs = await mensagens('export const soma = (a: number, b: number) => a + b;\n');
  expect(msgs).toEqual([]);
});
