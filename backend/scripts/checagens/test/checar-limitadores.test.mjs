import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// Critério: SEC-003 (T75). A checagem falha numa fixture sem o binding LIMITE_ESCRITA e passa no repositório; também
// recusa período fora de 10/60, limite inválido, contador dividido e Retry-After diferente do período.
const SCRIPT = resolve(import.meta.dirname, '..', 'checar-limitadores.mjs');
const RAIZ_REPOSITORIO = resolve(import.meta.dirname, '..', '..', '..', '..');
const pastas = [];

const limitador = (name, namespace_id, limit = 60, period = 60) => ({ name, namespace_id, simple: { limit, period } });
const COMPLETOS = [
  limitador('LIMITE_ENTRAR', '1001', 10),
  limitador('LIMITE_PUBLICO', '1002'),
  limitador('LIMITE_WEBHOOK', '1003'),
  limitador('LIMITE_ESCRITA', '1004'),
];
const APP = 'export const PERIODO_LIMITE_ESCRITA_S = 60;\n';

function repositorio(ratelimits, app = APP, wrangler) {
  const raiz = mkdtempSync(join(tmpdir(), 'limitadores-'));
  pastas.push(raiz);
  const arquivos = {
    'wrangler.jsonc': wrangler ?? `{\n  // comentário de JSONC\n  "ratelimits": ${JSON.stringify(ratelimits)}\n}\n`,
  };
  if (app !== null) arquivos['backend/api/src/entrada/app.ts'] = app;
  for (const [caminho, texto] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, caminho)), { recursive: true });
    writeFileSync(join(raiz, caminho), texto);
  }
  return raiz;
}

const rodar = (raiz) => spawnSync(process.execPath, [SCRIPT, raiz], { encoding: 'utf8' });

afterEach(() => {
  while (pastas.length) rmSync(pastas.pop(), { recursive: true, force: true });
});

describe('checar-limitadores (FUN-26, SEC-003)', () => {
  it('passa no repositório', () => {
    const r = rodar(RAIZ_REPOSITORIO);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('passa com os quatro limitadores completos', () => {
    expect(rodar(repositorio(COMPLETOS)).status).toBe(0);
  });

  it('falha sem o binding LIMITE_ESCRITA e diz qual falta', () => {
    const r = rodar(repositorio(COMPLETOS.filter((l) => l.name !== 'LIMITE_ESCRITA')));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('falta o limitador LIMITE_ESCRITA');
  });

  it.each(['LIMITE_ENTRAR', 'LIMITE_PUBLICO', 'LIMITE_WEBHOOK'])('falha sem %s', (nome) => {
    const r = rodar(repositorio(COMPLETOS.filter((l) => l.name !== nome)));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`falta o limitador ${nome}`);
  });

  it.each([
    ['período 30', limitador('LIMITE_ESCRITA', '1004', 60, 30), 'período 30'],
    ['limite 0', limitador('LIMITE_ESCRITA', '1004', 0), 'limite inválido'],
    ['limite fracionário', limitador('LIMITE_ESCRITA', '1004', 1.5), 'limite inválido'],
    ['contador dividido', limitador('LIMITE_ESCRITA', '1002'), 'dividem o namespace_id 1002'],
    ['sem namespace_id', { name: 'LIMITE_ESCRITA', simple: { limit: 60, period: 60 } }, 'sem namespace_id'],
  ])('falha com %s no LIMITE_ESCRITA', (_caso, escrita, mensagem) => {
    const r = rodar(repositorio([...COMPLETOS.slice(0, 3), escrita]));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(mensagem);
  });

  it('falha com um limitador declarado duas vezes', () => {
    const r = rodar(repositorio([...COMPLETOS, limitador('LIMITE_ESCRITA', '1005')]));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('LIMITE_ESCRITA declarado mais de uma vez');
  });

  it('falha quando o Retry-After (PERIODO_LIMITE_ESCRITA_S) não é o período do binding', () => {
    const r = rodar(repositorio(COMPLETOS, 'export const PERIODO_LIMITE_ESCRITA_S = 10;\n'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('PERIODO_LIMITE_ESCRITA_S = 10');
  });

  it('falha quando app.ts não declara PERIODO_LIMITE_ESCRITA_S', () => {
    const r = rodar(repositorio(COMPLETOS, 'export const OUTRA = 60;\n'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sem PERIODO_LIMITE_ESCRITA_S');
  });

  it('falha sem a lista ratelimits', () => {
    const r = rodar(repositorio(null, APP, '{ "name": "x" }\n'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sem a lista "ratelimits"');
  });

  it('falha fechada (código 2) sem wrangler.jsonc legível ou sem app.ts', () => {
    expect(rodar(repositorio(COMPLETOS, APP, '{ isto não é jsonc')).status).toBe(2);
    expect(rodar(repositorio(COMPLETOS, APP, '')).status).toBe(2);
    expect(rodar(repositorio(COMPLETOS, null)).status).toBe(2);
  });
});
