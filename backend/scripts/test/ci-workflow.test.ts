import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { checarActionsPorSha } from '../checagens/actions-por-sha.ts';
import { checarWranglerUnico } from '../checagens/wrangler-unico.ts';

const raiz = join(import.meta.dirname, '..', '..', '..');
const texto = readFileSync(join(raiz, '.github', 'workflows', 'ci.yml'), 'utf8');

interface Passo {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  if?: string;
  'continue-on-error'?: unknown;
}
interface Job {
  services?: Record<string, { image: string }>;
  steps: Passo[];
  'continue-on-error'?: unknown;
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}
const wf = parse(texto) as Workflow;
const passosDe = (job: string) => wf.jobs[job]?.steps ?? [];
const comandos = (job: string) => passosDe(job).map((p) => p.run ?? '');
const algumComando = (job: string, trecho: string) => comandos(job).some((c) => c.includes(trecho));

describe('ci.yml: qualidade, testes e banco', () => {
  test('FUN-40: roda em push e em pull_request, só com leitura do repositório', () => {
    expect(wf.on).toHaveProperty('push');
    expect(wf.on).toHaveProperty('pull_request');
    expect(wf.permissions).toEqual({ contents: 'read' });
  });

  test('FUN-40: tem os jobs qualidade, testes e banco', () => {
    expect(Object.keys(wf.jobs)).toEqual(expect.arrayContaining(['qualidade', 'testes', 'banco']));
  });

  test('FUN-40: qualidade roda lint, format, typecheck, checagens e gitleaks', () => {
    expect(algumComando('qualidade', 'pnpm lint')).toBe(true);
    expect(algumComando('qualidade', 'pnpm format:check')).toBe(true);
    expect(algumComando('qualidade', 'pnpm typecheck')).toBe(true);
    expect(algumComando('qualidade', 'pnpm test:checagens')).toBe(true);
    expect(
      passosDe('qualidade').some((p) => (p.uses ?? '').startsWith('gitleaks/gitleaks-action@')),
    ).toBe(true);
  });

  test('FUN-40: o gitleaks lê o histórico inteiro (fetch-depth 0)', () => {
    const checkout = passosDe('qualidade').find((p) =>
      (p.uses ?? '').startsWith('actions/checkout@'),
    );
    expect(checkout?.with?.['fetch-depth']).toBe(0);
  });

  test('FUN-40: testes roda a suíte no serviço postgres:18', () => {
    expect(wf.jobs.testes?.services?.postgres?.image).toBe('postgres:18');
    expect(algumComando('testes', 'pnpm test')).toBe(true);
  });

  test('FUN-40: banco usa postgres:18 e migra do zero antes de impressão digital, isolamento e zero DDL', () => {
    expect(wf.jobs.banco?.services?.postgres?.image).toBe('postgres:18');
    const cmds = comandos('banco');
    const migrar = cmds.findIndex((c) => c.includes('pnpm migrar'));
    expect(migrar).toBeGreaterThanOrEqual(0);
    expect(cmds.some((c) => c.includes('pnpm esquema:gerar'))).toBe(true);
    expect(cmds.some((c) => c.includes('git diff --exit-code'))).toBe(true);
    const testesDoBanco = cmds.findIndex((c) => c.includes('@pelada/api') && c.includes('test'));
    expect(testesDoBanco).toBeGreaterThan(migrar);
    expect(cmds.some((c) => c.includes('@pelada/scripts') && c.includes('test'))).toBe(true);
  });

  test('FUN-40: nenhum passo nem job usa continue-on-error, e nada engole erro', () => {
    for (const job of Object.values(wf.jobs)) {
      expect(job['continue-on-error']).toBeUndefined();
      for (const p of job.steps) {
        expect(p['continue-on-error']).toBeUndefined();
        expect(p.run ?? '').not.toContain('|| true');
      }
    }
  });

  test('FUN-40: todas as actions estão fixadas por SHA e a publicação do Worker fica só no deploy.yml', () => {
    expect(checarActionsPorSha({ raiz })).toEqual({ ok: true, violacoes: [] });
    expect(checarWranglerUnico({ raiz })).toEqual({ ok: true, violacoes: [] });
  });

  test('FUN-40: não há segredo do repositório no CI de pull request (nenhum secrets.* além do GITHUB_TOKEN)', () => {
    const usados = [...texto.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(usados.filter((s) => s !== 'GITHUB_TOKEN')).toEqual([]);
  });
});
