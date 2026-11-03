import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const raiz = resolve(import.meta.dirname, '..');
const pacotes = [
  ['backend/contrato', '@pelada/contrato'],
  ['backend/dominio', '@pelada/dominio'],
  ['backend/api', '@pelada/api'],
  ['backend/scripts', '@pelada/scripts'],
  ['frontend/web', '@pelada/web'],
] as const;

const ler = (caminho: string) => JSON.parse(readFileSync(resolve(raiz, caminho), 'utf8'));

describe.each(pacotes)('%s', (dir, nome) => {
  test(`FUN-01: ${nome} é type module com engines Node 26`, () => {
    const pkg = ler(`${dir}/package.json`);
    expect(pkg.name).toBe(nome);
    expect(pkg.type).toBe('module');
    expect(pkg.engines.node).toBe('>=26 <27');
  });

  test(`FUN-01: ${nome} tem TypeScript estrito`, () => {
    const tsconfig = resolve(raiz, dir, 'tsconfig.json');
    expect(existsSync(tsconfig)).toBe(true);
    const cfg = ler(`${dir}/tsconfig.json`);
    const base = cfg.extends ? ler(`${dir}/${cfg.extends}`) : {};
    const estrito = cfg.compilerOptions?.strict ?? base.compilerOptions?.strict;
    expect(estrito).toBe(true);
  });

  test(`FUN-02: ${nome} tem os scripts lint, typecheck e test`, () => {
    const { scripts } = ler(`${dir}/package.json`);
    for (const s of ['lint', 'typecheck', 'test']) expect(scripts[s]).toBeTruthy();
  });
});
