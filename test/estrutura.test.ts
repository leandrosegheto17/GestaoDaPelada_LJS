import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const raiz = join(import.meta.dirname, '..');
const pacotes = [
  'backend/contrato',
  'backend/dominio',
  'backend/api',
  'backend/scripts',
  'frontend/web',
];

const ler = (caminho: string) => readFileSync(join(raiz, caminho), 'utf8');

describe.each(pacotes)('estrutura de %s', (pacote) => {
  const pkg = JSON.parse(ler(`${pacote}/package.json`));

  test('FUN-01: type module e engines Node 26', () => {
    expect(pkg.type).toBe('module');
    expect(pkg.engines.node).toBe('>=26 <27');
  });

  test('FUN-02: tsconfig estrito (strict true na cadeia extends)', () => {
    const ts = JSON.parse(ler(`${pacote}/tsconfig.json`));
    const base = JSON.parse(ler('tsconfig.base.json'));
    const strict = ts.compilerOptions?.strict ?? base.compilerOptions?.strict;
    expect(strict).toBe(true);
  });

  test('FUN-02: scripts lint, typecheck e test', () => {
    for (const s of ['lint', 'typecheck', 'test']) expect(pkg.scripts[s]).toBeTruthy();
  });
});
