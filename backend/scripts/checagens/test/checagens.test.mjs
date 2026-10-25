import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const PASTA = resolve(import.meta.dirname, '..');
const pastas = [];

function repositorio(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'checagens-'));
  pastas.push(raiz);
  execFileSync('git', ['init', '-q'], { cwd: raiz });
  for (const [caminho, texto] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, caminho)), { recursive: true });
    writeFileSync(join(raiz, caminho), texto);
  }
  return raiz;
}

function rodar(script, raiz, ambiente = process.env) {
  return spawnSync(process.execPath, [join(PASTA, script), raiz], {
    encoding: 'utf8',
    env: ambiente,
  });
}

afterEach(() => {
  while (pastas.length) rmSync(pastas.pop(), { recursive: true, force: true });
});

describe('checar-ids-tarefa', () => {
  const script = 'checar-ids-tarefa.mjs';
  it.each([
    [`// ${'TP'}-0001`, 'comentário de linha'],
    [`/* ${'RTP'}-0041 */`, 'comentário de bloco'],
    [`const a = '${'SPK'}-0002';`, 'string'],
    [`// ${'tp'}-0001`, 'caixa baixa'],
    [`// ${'TP'}‑0001`, 'hífen não ASCII'],
    [`// ${'Lote'} 3`, 'lote'],
  ])('falha com %s (%s)', (codigo) => {
    const raiz = repositorio({ 'backend/api/src/a.ts': codigo });
    expect(rodar(script, raiz).status).toBe(1);
  });

  it('passa em código limpo e ignora .md', () => {
    const raiz = repositorio({ 'backend/api/src/a.ts': 'export {};', '.md/x.md': `${'TP'}-0001` });
    expect(rodar(script, raiz).status).toBe(0);
  });

  it('falha fechado sem arquivos ou sem git', () => {
    expect(rodar(script, repositorio({})).status).toBe(2);
    const raiz = repositorio({ 'backend/a.ts': 'export {};' });
    expect(rodar(script, raiz, { ...process.env, PATH: '' }).status).toBe(2);
  });
});

describe('checar-urls-absolutas (FUN-22)', () => {
  const script = 'checar-urls-absolutas.mjs';
  it.each([
    "const a = 'https://x.com';",
    "const a = 'HTTPS://x.com';",
    "const a = 'ws://x.com';",
    "const a = '//x.com/a';",
    "const a = 'algo.workers.dev';",
  ])('falha com %s', (codigo) => {
    const raiz = repositorio({ 'backend/api/src/a.ts': codigo });
    expect(rodar(script, raiz).status).toBe(1);
  });

  it('passa em testes, em config/ e nas exceções', () => {
    const raiz = repositorio({
      'backend/api/src/a.ts': "const s = 'http://www.w3.org/2000/svg';",
      'backend/api/test/a.test.ts': "const a = 'https://x.com';",
      'backend/api/src/config/a.ts': "const a = 'https://x.com';",
    });
    expect(rodar(script, raiz).status).toBe(0);
  });

  it('falha fechado sem arquivos', () => {
    expect(rodar(script, repositorio({})).status).toBe(2);
  });
});
