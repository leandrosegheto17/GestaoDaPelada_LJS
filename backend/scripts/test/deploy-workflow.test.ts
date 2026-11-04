import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { checarActionsPorSha } from '../checagens/actions-por-sha.ts';
import { checarWranglerUnico } from '../checagens/wrangler-unico.ts';

const raiz = join(import.meta.dirname, '..', '..', '..');
const texto = readFileSync(join(raiz, '.github', 'workflows', 'deploy.yml'), 'utf8');

interface Passo {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  'continue-on-error'?: unknown;
}
interface Job {
  if?: string;
  environment?: string;
  steps: Passo[];
}
interface Workflow {
  on: Record<string, unknown>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs: Record<string, Job>;
}
const wf = parse(texto) as Workflow;
const jobs = Object.values(wf.jobs);
const job = jobs[0]!;
const passos = job.steps;
const indice = (trecho: string) =>
  passos.findIndex((p) => (p.run ?? '').includes(trecho) || (p.uses ?? '').includes(trecho));
const usaSegredoDe = (p: Passo, prefixos: string[]) =>
  Object.values(p.env ?? {}).some((v) => prefixos.some((x) => v.includes(`secrets.${x}`)));

describe('deploy.yml', () => {
  test('FUN-41: só workflow_dispatch, condição de main e environment producao (AD-119)', () => {
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch']);
    expect(jobs).toHaveLength(1);
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
    expect(job.environment).toBe('producao');
  });

  test('FUN-57: concurrency com cancel-in-progress falso', () => {
    expect(wf.concurrency?.group).toBeTruthy();
    expect(wf.concurrency?.['cancel-in-progress']).toBe(false);
  });

  test('FUN-42: a ordem é build, restauração, dump, migração, deploy e saúde', () => {
    const ordem = [
      indice('@pelada/web build'),
      indice('restauracao-neon'),
      indice('dump-cifrado'),
      indice('pnpm migrar'),
      indice('wrangler deploy'),
      indice('verificar-saude'),
    ];
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  test('FUN-43: o build vem antes de qualquer passo que use secrets do Neon ou da Cloudflare', () => {
    const build = indice('@pelada/web build');
    const primeiroComSegredo = passos.findIndex((p) =>
      usaSegredoDe(p, ['NEON_', 'CLOUDFLARE_', 'BACKUP_']),
    );
    expect(primeiroComSegredo).toBeGreaterThan(build);
  });

  test('FUN-44: o deploy vem depois da migração e nada tem continue-on-error', () => {
    expect(indice('wrangler deploy')).toBeGreaterThan(indice('pnpm migrar'));
    for (const p of passos) {
      expect(p['continue-on-error']).toBeUndefined();
      expect(p.run ?? '').not.toContain('|| true');
    }
  });

  test('FUN-58: URL_PUBLICA vazia faz um passo anterior ao deploy falhar', () => {
    const guarda = passos.findIndex(
      (p) => (p.run ?? '').includes('URL_PUBLICA') && (p.run ?? '').includes('exit 1'),
    );
    expect(guarda).toBeGreaterThanOrEqual(0);
    expect(guarda).toBeLessThan(indice('wrangler deploy'));
    expect(passos[guarda]?.env?.URL_PUBLICA).toContain('secrets.URL_PUBLICA');
  });

  test('FUN-42: o deploy injeta URL_PUBLICA e VERSAO (o SHA) por --var', () => {
    const deploy = passos[indice('wrangler deploy')]!;
    expect(deploy.run).toContain('--var URL_PUBLICA:');
    expect(deploy.run).toContain('--var VERSAO:');
    expect(deploy.env?.VERSAO ?? '').toContain('github.sha');
  });

  test('AD-010: o dump usa a role somente leitura (NEON_URL_BACKUP) e a migração, a de migração', () => {
    const dump = passos[indice('dump-cifrado')]!;
    expect(dump.env?.DATABASE_URL).toContain('secrets.NEON_URL_BACKUP');
    const migrar = passos[indice('pnpm migrar')]!;
    expect(migrar.env?.DATABASE_URL_MIGRACAO).toContain('secrets.NEON_URL_MIGRACAO');
    expect(migrar.env?.PELADA_PERMITIR_HOST_REMOTO).toBe('1');
  });

  test('FUN-41: actions fixadas por SHA e wrangler deploy só neste arquivo', () => {
    expect(checarActionsPorSha({ raiz })).toEqual({ ok: true, violacoes: [] });
    expect(checarWranglerUnico({ raiz })).toEqual({ ok: true, violacoes: [] });
  });
});
