import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';

const raiz = join(import.meta.dirname, '..', '..', '..');
const caminho = join(raiz, '.github', 'workflows', 'backup.yml');
const texto = readFileSync(caminho, 'utf8');

interface Passo {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  'continue-on-error'?: unknown;
}
interface Job {
  environment?: string;
  steps: Passo[];
}
interface Workflow {
  on: { schedule: { cron: string }[]; workflow_dispatch?: unknown };
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}
const wf = parse(texto) as Workflow;
const jobs = Object.values(wf.jobs);
const passos = jobs.flatMap((j) => j.steps);
const upload = () => passos.find((p) => (p.uses ?? '').startsWith('actions/upload-artifact'))!;

describe('backup.yml', () => {
  test('FUN-47: cron 0 7 * * *, workflow_dispatch, environment backup (AD-013), retenção 30 dias', () => {
    expect(wf.on.schedule).toEqual([{ cron: '0 7 * * *' }]);
    expect(wf.on).toHaveProperty('workflow_dispatch');
    expect(jobs[0]!.environment).toBe('backup');
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect((upload().with as Record<string, unknown>)['retention-days']).toBe(30);
  });

  test('FUN-49: o dump não engole erro e o upload falha sem arquivo', () => {
    for (const p of passos) {
      expect(p['continue-on-error']).toBeUndefined();
      expect(String(p.run ?? '')).not.toContain('|| true');
    }
    expect((upload().with as Record<string, unknown>)['if-no-files-found']).toBe('error');
    expect(texto).toContain('NEON_URL_BACKUP');
    expect(texto).toContain('BACKUP_CHAVE');
  });

  test('FUN-47: todo uses: está fixado por SHA de 40 caracteres', () => {
    const usos = passos.map((p) => p.uses).filter(Boolean) as string[];
    expect(usos.length).toBeGreaterThan(0);
    for (const u of usos) expect(u).toMatch(/@[0-9a-f]{40}(\s|$)/);
  });

  test('FUN-47: nenhum segredo literal (URL com senha, chave age privada)', () => {
    expect(texto).not.toMatch(/postgres(ql)?:\/\/[^$\s]+:[^$\s]+@/);
    expect(texto).not.toContain('AGE-SECRET-KEY');
  });
});
