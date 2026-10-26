import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(import.meta.dirname, '..');
const ler = (caminho: string) => readFileSync(resolve(raiz, caminho), 'utf8');
const lerJson = (caminho: string) => JSON.parse(ler(caminho)) as Record<string, unknown>;

const PACOTES = ['backend/contrato', 'backend/dominio', 'backend/api', 'backend/scripts', 'frontend/web'];

describe('monorepo (FUN-01)', () => {
  it('exige Node 24 em engines', () => {
    const pkg = lerJson('package.json') as { engines: { node: string } };
    expect(pkg.engines.node).toBe('>=24 <25');
  });

  it('fixa Node 24 no .nvmrc', () => {
    expect(ler('.nvmrc').trim()).toBe('24');
  });

  it('usa pnpm 11 como gerenciador', () => {
    const pkg = lerJson('package.json') as { packageManager: string };
    expect(pkg.packageManager).toMatch(/^pnpm@11\./);
  });

  it('declara type: module na raiz e nos pacotes com package.json', () => {
    expect(lerJson('package.json').type).toBe('module');
    for (const pacote of PACOTES.filter((p) => existsSync(resolve(raiz, p, 'package.json')))) {
      expect(lerJson(`${pacote}/package.json`).type, pacote).toBe('module');
    }
  });

  it('lista os pacotes com package.json no workspace', () => {
    const yaml = ler('pnpm-workspace.yaml');
    for (const pacote of PACOTES.filter((p) => existsSync(resolve(raiz, p, 'package.json')))) {
      expect(yaml, pacote).toContain(`- ${pacote}`);
    }
  });

  it('usa TypeScript estrito herdado da base em todos os pacotes', () => {
    const base = lerJson('tsconfig.base.json') as { compilerOptions: { strict: boolean } };
    expect(base.compilerOptions.strict).toBe(true);
    for (const pacote of PACOTES) {
      const ts = lerJson(`${pacote}/tsconfig.json`) as { extends: string };
      expect(ts.extends, pacote).toBe('../../tsconfig.base.json');
    }
  });
});

describe('scripts padrão na raiz (FUN-02)', () => {
  it('define lint, typecheck e test', () => {
    const { scripts } = lerJson('package.json') as { scripts: Record<string, string> };
    expect(scripts.lint).toContain('eslint .');
    expect(scripts.typecheck).toContain('pnpm -r typecheck');
    expect(scripts.test).toContain('pnpm -r test');
  });
});
