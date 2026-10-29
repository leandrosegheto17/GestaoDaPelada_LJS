import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// G-26, GEL-83, GEL-111: só o repositório de jogadores (e as migrations) escreve `periodos_ativos` e
// `jogadores.inicio_pontuacao`. A checagem falha em qualquer outro arquivo de código que escreva neles.
const SCRIPT = resolve(import.meta.dirname, '..', 'checar-escritores-periodo.mjs');
const RAIZ_REAL = resolve(import.meta.dirname, '..', '..', '..', '..');
const REPOS = 'backend/api/src/infraestrutura/db/repositorios';
const FORA = 'backend/api/src/entrada/rotas/intrusa.ts';
const temporarias = [];

function repositorio(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'escritores-periodo-'));
  temporarias.push(raiz);
  execFileSync('git', ['init', '-q'], { cwd: raiz });
  for (const [nome, texto] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, nome)), { recursive: true });
    writeFileSync(join(raiz, nome), texto);
  }
  return raiz;
}

const rodar = (raiz) => spawnSync(process.execPath, [SCRIPT, raiz], { encoding: 'utf8' });
/** Um arquivo neutro, para a lista de arquivos nunca ficar vazia. */
const BASE = { 'backend/api/src/neutro.ts': 'export const x = 1;\n' };

afterEach(() => {
  while (temporarias.length) rmSync(temporarias.pop(), { recursive: true, force: true });
});

describe('checar-escritores-periodo (GEL-111, GEL-83)', () => {
  it.each([
    ['insertInto', "await db.insertInto('periodos_ativos').values(v).execute();"],
    ['insertInto com alias e aspas duplas', 'await db.insertInto("periodos_ativos as p").values(v).execute();'],
    ['updateTable', "await db.updateTable('periodos_ativos').set({ fim: d }).execute();"],
    ['deleteFrom', "await db.deleteFrom('periodos_ativos').where('id', '=', id).execute();"],
    ['SQL cru: UPDATE', 'await sql`UPDATE periodos_ativos SET fim = ${d} WHERE id = ${id}`.execute(db);'],
    ['SQL cru: INSERT', "await c.query('INSERT INTO public.periodos_ativos (inicio) VALUES ($1)', [d]);"],
    ['SQL cru: DELETE', 'await c.query(\'delete from "periodos_ativos" where id = $1\', [id]);'],
    ['inicio_pontuacao no set do Kysely', "await db.updateTable('jogadores').set({ inicio_pontuacao: d }).execute();"],
    [
      'inicio_pontuacao no values do Kysely',
      "await db.insertInto('jogadores').values({ apelido, inicio_pontuacao }).execute();",
    ],
    ['set de inicio_pontuacao por nome', "await db.updateTable('jogadores').set('inicio_pontuacao', d).execute();"],
    [
      'SQL cru: UPDATE de inicio_pontuacao',
      "await c.query('UPDATE jogadores SET apelido = $1, inicio_pontuacao = $2', v);",
    ],
    [
      'SQL cru: INSERT com inicio_pontuacao',
      "await c.query('INSERT INTO jogadores (apelido, inicio_pontuacao) VALUES ($1, $2)', v);",
    ],
  ])('falha com %s fora do repositório de jogadores', (_caso, linha) => {
    const r = rodar(repositorio({ ...BASE, [FORA]: `export async function f() {\n  ${linha}\n}\n` }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${FORA}:2:`);
  });

  it('falha também noutro repositório e num script, e numa migration fora da pasta de migrations', () => {
    const r = rodar(
      repositorio({
        ...BASE,
        [`${REPOS}/presencas.ts`]: "export const f = (db) => db.updateTable('periodos_ativos').set({ fim: null });\n",
        'backend/scripts/consertar.ts': "await c.query('UPDATE periodos_ativos SET fim = NULL');\n",
        'backend/scripts/consertar.sql': 'SELECT 1;\nUPDATE jogadores SET inicio_pontuacao = NULL;\n',
      }),
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${REPOS}/presencas.ts:1:`);
    expect(r.stderr).toContain('backend/scripts/consertar.ts:1:');
    expect(r.stderr).toContain('backend/scripts/consertar.sql:2:');
  });

  it('passa com as escritas no repositório de jogadores, nas migrations e nos testes', () => {
    const escrita = [
      "await db.insertInto('periodos_ativos').values(v).execute();",
      "await db.updateTable('jogadores').set({ inicio_pontuacao: d }).execute();",
      'await sql`UPDATE periodos_ativos SET fim = ${d}`.execute(db);',
    ].join('\n');
    const r = rodar(
      repositorio({
        ...BASE,
        [`${REPOS}/jogadores.ts`]: escrita,
        'backend/api/src/infraestrutura/db/migracoes/1792844999999_x.sql':
          'UPDATE periodos_ativos SET fim = NULL;\nUPDATE jogadores SET inicio_pontuacao = NULL;\n',
        'backend/api/test/repositorios/fixture.test.ts': escrita,
        'backend/api/test/apoio/cenario.ts': escrita,
      }),
    );
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('passa com leituras: selectFrom, join, coluna no select, tipo da tabela e SQL de SELECT', () => {
    const leitura = [
      "await db.selectFrom('periodos_ativos').select(['inicio', 'fim']).execute();",
      "await db.selectFrom('jogadores as j').innerJoin('periodos_ativos as p', 'p.jogador_id', 'j.id').select('j.inicio_pontuacao');",
      'export interface TabelaJogadores { inicio_pontuacao: string | null }',
      "await c.query('SELECT inicio, fim FROM periodos_ativos WHERE jogador_id = $1', [id]);",
      "await c.query('SELECT inicio_pontuacao FROM jogadores');",
      'const { inicio_pontuacao } = linha;',
    ].join('\n');
    const r = rodar(repositorio({ ...BASE, [FORA]: leitura }));
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('o repositório real passa', () => {
    const r = rodar(RAIZ_REAL);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('roda no job base do CI', () => {
    const ci = readFileSync(join(RAIZ_REAL, '.github/workflows/ci.yml'), 'utf8');
    const base = ci.slice(ci.indexOf('\n  base:'), ci.indexOf('\n  banco:'));
    expect(base).toContain('- run: node backend/scripts/checagens/checar-escritores-periodo.mjs');
  });

  it('falha fechado sem arquivos de código', () => {
    expect(rodar(repositorio({ 'LEIA.md': '# nada' })).status).toBe(2);
  });
});
