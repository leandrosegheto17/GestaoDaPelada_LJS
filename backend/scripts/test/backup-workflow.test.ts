import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';

const raiz = join(import.meta.dirname, '..', '..', '..');
const caminho = join(raiz, '.github', 'workflows', 'backup.yml');
const texto = readFileSync(caminho, 'utf8');
const wf = parse(texto);
const passos: Record<string, unknown>[] = Object.values(wf.jobs as Record<string, any>).flatMap(
  (j) => j.steps,
);

describe('backup.yml', () => {
  test('FUN-47: cron 0 7 * * *, workflow_dispatch, environment backup (AD-013), retenção 30 dias', () => {
    expect(wf.on.schedule).toEqual([{ cron: '0 7 * * *' }]);
    expect(wf.on).toHaveProperty('workflow_dispatch');
    const job = Object.values(wf.jobs as Record<string, any>)[0];
    expect(job.environment).toBe('backup');
    expect(wf.permissions).toEqual({ contents: 'read' });
    const upload = passos.find((p) => String(p.uses ?? '').startsWith('actions/upload-artifact'))!;
    expect((upload.with as any)['retention-days']).toBe(30);
  });

  test('FUN-49: o dump não engole erro e o upload falha sem arquivo', () => {
    for (const p of passos) {
      expect(p['continue-on-error']).toBeUndefined();
      expect(String(p.run ?? '')).not.toContain('|| true');
    }
    const upload = passos.find((p) => String(p.uses ?? '').startsWith('actions/upload-artifact'))!;
    expect((upload.with as any)['if-no-files-found']).toBe('error');
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
