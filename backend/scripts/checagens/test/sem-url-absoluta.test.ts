import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { checarSemUrlAbsoluta } from '../sem-url-absoluta.ts';

const pastas: string[] = [];
function repo(arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'pelada-url-'));
  pastas.push(raiz);
  for (const [caminho, texto] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, caminho)), { recursive: true });
    writeFileSync(join(raiz, caminho), texto);
  }
  return raiz;
}
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

describe('checarSemUrlAbsoluta', () => {
  test('FUN-23: ljssoftware.com.br em arquivo de código reprova, citando arquivo e linha', () => {
    const raiz = repo({
      'backend/api/src/a.ts': "const x = 1;\nconst u = 'https://app.ljssoftware.com.br/x';\n",
    });
    const r = checarSemUrlAbsoluta({ raiz });
    expect(r.ok).toBe(false);
    expect(r.violacoes).toEqual([expect.stringContaining('backend/api/src/a.ts:2')]);
  });

  test('FUN-23: o mesmo texto em docs/ passa', () => {
    const raiz = repo({ 'docs/guia.md': 'veja https://gestaodapelada.ljssoftware.com.br\n' });
    expect(checarSemUrlAbsoluta({ raiz })).toEqual({ ok: true, violacoes: [] });
  });

  test('FUN-23: workers.dev em um .ts reprova', () => {
    const raiz = repo({
      'frontend/web/src/api.ts': "export const base = 'https://x.workers.dev';\n",
    });
    expect(checarSemUrlAbsoluta({ raiz }).ok).toBe(false);
  });

  test('FUN-23: migração SQL com a URL reprova', () => {
    const raiz = repo({
      'backend/api/src/infraestrutura/db/migracoes/1_x.sql': "select 'https://a.workers.dev';\n",
    });
    expect(checarSemUrlAbsoluta({ raiz }).ok).toBe(false);
  });

  test.each([
    'wrangler.jsonc',
    '.env.example',
    '.specs/features/x/spec.md',
    'docs/runbook.md',
    '.claude/CLAUDE.md',
  ])('FUN-23: %s está na lista permitida', (caminho) => {
    const raiz = repo({ [caminho]: 'gestaodapelada.ljssoftware.com.br e x.workers.dev\n' });
    expect(checarSemUrlAbsoluta({ raiz }).ok).toBe(true);
  });

  test('FUN-23: node_modules, dist e .git são ignorados', () => {
    const raiz = repo({
      'node_modules/p/i.js': 'x.workers.dev',
      'frontend/web/dist/a.js': 'x.workers.dev',
      '.git/config': 'x.workers.dev',
    });
    expect(checarSemUrlAbsoluta({ raiz }).ok).toBe(true);
  });

  test('FUN-23: o próprio teste da checagem e a checagem não contam (são a definição do padrão)', () => {
    const raiz = repo({
      'backend/scripts/checagens/sem-url-absoluta.ts': "const a = 'workers.dev';",
      'backend/scripts/checagens/test/sem-url-absoluta.test.ts': "const a = 'workers.dev';",
    });
    expect(checarSemUrlAbsoluta({ raiz }).ok).toBe(true);
  });
});
