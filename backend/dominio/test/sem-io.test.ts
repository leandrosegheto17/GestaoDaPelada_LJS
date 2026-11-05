import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const ARQUIVO = join(RAIZ, 'backend', 'dominio', 'src', 'exemplo-sem-io.ts');

async function errosDe(codigo: string) {
  const eslint = new ESLint({ cwd: RAIZ });
  const [resultado] = await eslint.lintText(codigo, { filePath: ARQUIVO });
  return (resultado?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports');
}

describe('domínio sem I/O', () => {
  it('FUN-06: import de node:fs no domínio é recusado pelo lint', async () => {
    const erros = await errosDe(
      "import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n",
    );
    expect(erros).toHaveLength(1);
    expect(erros[0]?.message).toContain('FUN-06');
  });

  it('FUN-06: import de pg no domínio é recusado pelo lint', async () => {
    const erros = await errosDe("import pg from 'pg';\nexport const x = pg;\n");
    expect(erros).toHaveLength(1);
  });

  it('FUN-06: arquivo sem I/O passa sem erro', async () => {
    const erros = await errosDe('export const soma = (a: number, b: number): number => a + b;\n');
    expect(erros).toHaveLength(0);
  });
});
