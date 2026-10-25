import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '..', 'checar-urls-absolutas.mjs');
const temporarias = [];

function repositorio(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'urls-'));
  temporarias.push(raiz);
  execFileSync('git', ['init', '-q'], { cwd: raiz });
  for (const [nome, texto] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, nome)), { recursive: true });
    writeFileSync(join(raiz, nome), texto);
  }
  return raiz;
}

const rodar = (raiz) => spawnSync(process.execPath, [SCRIPT, raiz], { encoding: 'utf8' });

afterEach(() => {
  while (temporarias.length) rmSync(temporarias.pop(), { recursive: true, force: true });
});

describe('checar-urls-absolutas: domínio do app (FUN-22)', () => {
  it.each([
    ['código', 'backend/api/src/a.ts', "const host = 'gestaodapelada.ljssoftware.com.br';"],
    ['migration SQL', 'backend/api/src/infraestrutura/db/migracoes/1_x.sql', '-- ver ljssoftware.com.br\nSELECT 1;'],
    ['workers.dev sem esquema', 'frontend/web/src/a.ts', "const h = 'pelada.conta.workers.dev';"],
  ])('falha com o domínio em %s', (_nome, caminho, texto) => {
    const r = rodar(repositorio({ [caminho]: texto }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(caminho);
  });

  it('passa com o domínio só na configuração permitida (wrangler.jsonc)', () => {
    const raiz = repositorio({
      'wrangler.jsonc': '{ "routes": [{ "pattern": "gestaodapelada.ljssoftware.com.br", "custom_domain": true }] }',
      'backend/api/src/a.ts': 'export {};',
    });
    expect(rodar(raiz).status).toBe(0);
  });
});
