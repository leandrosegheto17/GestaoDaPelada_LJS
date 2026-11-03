import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { expect, test } from 'vitest';

const caminho = resolve(import.meta.dirname, '../../../.github/workflows/backup.yml');
const texto = readFileSync(caminho, 'utf8');
const wf = parse(texto);
const job = Object.values<{ steps: Record<string, unknown>[] }>(wf.jobs)[0]!;

test('FUN-47: cron 07:00 UTC, disparo manual, environment producao e retenção de 30 dias', () => {
  expect(wf.on.schedule).toEqual([{ cron: '0 7 * * *' }]);
  expect(wf.on).toHaveProperty('workflow_dispatch');
  expect(Object.values<{ environment: string }>(wf.jobs)[0]!.environment).toBe('producao');
  const upload = job.steps.find((s) => String(s.uses ?? '').startsWith('actions/upload-artifact'));
  expect((upload!.with as Record<string, unknown>)['retention-days']).toBe(30);
});

test('FUN-47: permissões mínimas e segredos vindos de NEON_URL_BACKUP e BACKUP_CHAVE', () => {
  expect(wf.permissions).toEqual({ contents: 'read' });
  expect(texto).toContain('secrets.NEON_URL_BACKUP');
  expect(texto).toContain('secrets.BACKUP_CHAVE');
  expect(texto).toContain('postgresql-client-18');
  expect(texto).toMatch(/\bage\b/);
});

test('FUN-49: o passo do dump falha visivelmente e o upload não aceita arquivo ausente', () => {
  expect(texto).not.toMatch(/continue-on-error/);
  expect(texto).not.toMatch(/\|\|\s*true/);
  const dump = job.steps.find((s) => String(s.run ?? '').includes('dump-cifrado.sh'));
  expect(dump).toBeTruthy();
  const upload = job.steps.find((s) => String(s.uses ?? '').startsWith('actions/upload-artifact'));
  expect((upload!.with as Record<string, unknown>)['if-no-files-found']).toBe('error');
});

test('FUN-47: todo uses está fixado por SHA de 40 caracteres', () => {
  const usos = [...texto.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]!);
  expect(usos.length).toBeGreaterThan(0);
  for (const uso of usos) expect(uso).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
});

test('FUN-47: nenhum segredo literal no arquivo', () => {
  expect(texto).not.toMatch(/postgres(ql)?:\/\/[^$\s]*:[^$\s{]+@/);
  expect(texto).not.toMatch(/age1[0-9a-z]{50,}/);
});
