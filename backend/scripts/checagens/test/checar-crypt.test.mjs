import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// G-02 (AD-008): `crypt(` só nas migrations (funções de conta), nunca no código da aplicação.
const SCRIPT = resolve(import.meta.dirname, '..', 'checar-crypt.mjs');
const RAIZ_REAL = resolve(import.meta.dirname, '..', '..', '..', '..');
const MIGRACOES = 'backend/api/src/infraestrutura/db/migracoes';
const temporarias = [];

function repositorio(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'crypt-'));
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

describe('checar-crypt (G-02)', () => {
  it.each([
    ['backend/api/src/infraestrutura/db/repositorios/contas.ts', "sql`crypt(${senha}, gen_salt('bf', 12))`"],
    ['backend/api/src/aplicacao/acesso/entrar.ts', "const q = 'SELECT CRYPT ($1, senha_hash)';"],
    ['backend/scripts/dono.ts', "await c.query('UPDATE contas SET senha_hash = crypt($1, $2)');"],
    ['backend/api/src/infraestrutura/db/consultas.sql', "SELECT crypt('x', gen_salt('bf'));"],
    ['frontend/web/src/a.ts', 'crypt(senha)'],
  ])('falha com crypt( em %s', (caminho, texto) => {
    const r = rodar(repositorio({ [caminho]: texto }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${caminho}:1:`);
  });

  it('passa com crypt( nas migrations e nos testes, e com palavras que só contêm crypt', () => {
    const raiz = repositorio({
      [`${MIGRACOES}/1792843440000_conta.sql`]: "SELECT crypt(p_senha, gen_salt('bf', 12));",
      'backend/api/test/migracoes/conta.test.ts': "await c.query('SELECT crypt($2, senha_hash) = senha_hash');",
      'backend/api/src/a.test.ts': 'crypt(x)',
      'backend/api/src/b.ts': 'const decifrado = decrypt(x); pgp_sym_encrypt(y);',
    });
    expect(rodar(raiz).status).toBe(0);
  });

  it('o repositório atual passa', () => {
    const r = rodar(RAIZ_REAL);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('roda no job base do CI', () => {
    const ci = readFileSync(join(RAIZ_REAL, '.github/workflows/ci.yml'), 'utf8');
    const base = ci.slice(ci.indexOf('\n  base:'), ci.indexOf('\n  banco:'));
    expect(base).toContain('- run: node backend/scripts/checagens/checar-crypt.mjs');
  });
});
