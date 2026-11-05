import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..');

const PACOTES = [
  { dir: 'backend/contrato', nome: '@pelada/contrato' },
  { dir: 'backend/dominio', nome: '@pelada/dominio' },
  { dir: 'backend/api', nome: '@pelada/api' },
  { dir: 'backend/scripts', nome: '@pelada/scripts' },
  { dir: 'frontend/web', nome: '@pelada/web' },
] as const;

function lerJson(caminho: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(RAIZ, caminho), 'utf8')) as Record<string, unknown>;
}

describe('estrutura do monorepo', () => {
  it('FUN-01: a raiz é pnpm 11 com Node 26 e type module', () => {
    const raiz = lerJson('package.json');
    expect(raiz.type).toBe('module');
    expect((raiz.engines as Record<string, string>).node).toBe('>=26 <27');
    expect(String(raiz.packageManager)).toMatch(/^pnpm@11\./);
    expect(readFileSync(join(RAIZ, '.nvmrc'), 'utf8').trim()).toBe('26');
  });

  it('FUN-02: a raiz expõe lint, format:check, typecheck e test', () => {
    const scripts = lerJson('package.json').scripts as Record<string, string>;
    for (const s of ['lint', 'format:check', 'typecheck', 'test']) {
      expect(scripts[s], s).toBeTruthy();
    }
  });

  for (const { dir, nome } of PACOTES) {
    describe(nome, () => {
      it('FUN-01: package.json com nome, type module e engines Node 26', () => {
        const pkg = lerJson(`${dir}/package.json`);
        expect(pkg.name).toBe(nome);
        expect(pkg.type).toBe('module');
        expect((pkg.engines as Record<string, string> | undefined)?.node).toBe('>=26 <27');
      });

      it('FUN-01: tsconfig com strict: true', () => {
        const ts = lerJson(`${dir}/tsconfig.json`);
        const opcoes = ts.compilerOptions as Record<string, unknown> | undefined;
        expect(opcoes?.strict).toBe(true);
      });

      it('FUN-02: scripts lint, typecheck e test', () => {
        const scripts = lerJson(`${dir}/package.json`).scripts as Record<string, string>;
        for (const s of ['lint', 'typecheck', 'test']) {
          expect(scripts[s], `${nome} ${s}`).toBeTruthy();
        }
      });
    });
  }
});
