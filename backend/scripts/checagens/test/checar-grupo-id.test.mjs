import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// G-03: toda função de repositório de dado de grupo recebe `grupoId` como primeiro parâmetro de dado (depois do
// `db: Db`). Funções que não são de dado de grupo ficam numa lista de exceções, cada uma com motivo.
const SCRIPT = resolve(import.meta.dirname, '..', 'checar-grupo-id.mjs');
const RAIZ_REAL = resolve(import.meta.dirname, '..', '..', '..', '..');
const REPOS = 'backend/api/src/infraestrutura/db/repositorios';
const EXCECOES = 'backend/scripts/checagens/grupo-id-excecoes.json';
const temporarias = [];

function repositorio(arquivos, excecoes = []) {
  const raiz = mkdtempSync(join(tmpdir(), 'grupo-id-'));
  temporarias.push(raiz);
  execFileSync('git', ['init', '-q'], { cwd: raiz });
  const todos = { ...arquivos, [EXCECOES]: JSON.stringify(excecoes) };
  for (const [nome, texto] of Object.entries(todos)) {
    mkdirSync(dirname(join(raiz, nome)), { recursive: true });
    writeFileSync(join(raiz, nome), texto);
  }
  return raiz;
}

const rodar = (raiz) => spawnSync(process.execPath, [SCRIPT, raiz], { encoding: 'utf8' });
const repo = (texto) => ({ [`${REPOS}/grupo.ts`]: `import type { Db } from '../index.ts';\n${texto}` });

afterEach(() => {
  while (temporarias.length) rmSync(temporarias.pop(), { recursive: true, force: true });
});

describe('checar-grupo-id (G-03)', () => {
  it.each([
    ['função sem grupoId', 'export async function listar(db: Db, contaId: string) {}', 'listar'],
    ['grupoId fora do primeiro lugar', 'export function remover(db: Db, id: string, grupoId: string) {}', 'remover'],
    ['arrow sem grupoId', 'export const ler = async (db: Db, id: string) => id;', 'ler'],
    ['function expression sem grupoId', 'export const ler = function (db: Db) {};', 'ler'],
    ['grupoId desestruturado', 'export function f(db: Db, { grupoId }: { grupoId: string }) {}', 'f'],
    ['rest no lugar de grupoId', 'export function f(db: Db, ...grupoId: string[]) {}', 'f'],
    ['export que não é função', 'export const f = outra;\nconst outra = 1;', 'f'],
    ['export default sem grupoId', 'export default function (db: Db) {}', 'default'],
    ['classe exportada', 'export class Repo { listar(db: Db) {} }', 'Repo'],
  ])('falha com %s', (_caso, texto, nome) => {
    const r = rodar(repositorio(repo(texto)));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`grupo.ts:2: ${nome}:`);
  });

  it('falha com re-export (não analisável)', () => {
    const r = rodar(repositorio(repo("export { listar } from './outro.ts';")));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('grupo.ts:2: *:');
  });

  it('passa com grupoId primeiro (depois do db, ou sem db), tipos exportados e funções internas', () => {
    const raiz = repositorio(
      repo(
        [
          'export interface Linha { id: string }',
          'export type Resultado = "ok";',
          'export async function listar(db: Db, grupoId: string, id: string) {}',
          'export const remover = async (db: Db, grupoId: string) => grupoId;',
          'export function semDb(grupoId: string) {}',
          'function interna(db: Db, id: string) {}',
        ].join('\n'),
      ),
    );
    const r = rodar(raiz);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('ignora testes dentro da pasta de repositórios', () => {
    const raiz = repositorio({ [`${REPOS}/grupo.test.ts`]: 'export function f(db, id) {}' });
    expect(rodar(raiz).status).toBe(0);
  });

  it('exceção com motivo libera o arquivo inteiro ou só a função dela', () => {
    const raiz = repositorio(
      {
        [`${REPOS}/contas.ts`]: 'export function eu(db) {}\nexport function entrar(db, email) {}',
        [`${REPOS}/convites.ts`]:
          'export function ler(db, token) {}\nexport function criar(db: Db, grupoId: string) {}',
      },
      [
        { arquivo: 'contas.ts', motivo: 'conta, não grupo' },
        { arquivo: 'convites.ts', funcao: 'ler', motivo: 'parte do token' },
      ],
    );
    const r = rodar(raiz);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('a exceção de uma função não libera as outras do arquivo', () => {
    const raiz = repositorio(
      { [`${REPOS}/convites.ts`]: 'export function ler(db, token) {}\nexport function aceitar(db, token) {}' },
      [{ arquivo: 'convites.ts', funcao: 'ler', motivo: 'parte do token' }],
    );
    const r = rodar(raiz);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('convites.ts:2: aceitar:');
    expect(r.stderr).not.toContain('ler:');
  });

  it('falha com exceção sem motivo ou que não corresponde a nada', () => {
    const raiz = repositorio({ [`${REPOS}/contas.ts`]: 'export function eu(db) {}' }, [
      { arquivo: 'contas.ts' },
      { arquivo: 'sumiu.ts', motivo: 'arquivo apagado' },
    ]);
    const r = rodar(raiz);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('exceção sem motivo (contas.ts)');
    expect(r.stderr).toContain('exceção sem correspondência (sumiu.ts)');
  });

  it('falha fechado sem a pasta de repositórios', () => {
    const r = rodar(repositorio({ 'README.md': 'x' }));
    expect(r.status).toBe(2);
  });

  it('o repositório atual passa', () => {
    const r = rodar(RAIZ_REAL);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('roda no job base do CI', () => {
    const ci = readFileSync(join(RAIZ_REAL, '.github/workflows/ci.yml'), 'utf8');
    const base = ci.slice(ci.indexOf('\n  base:'), ci.indexOf('\n  banco:'));
    expect(base).toContain('- run: node backend/scripts/checagens/checar-grupo-id.mjs');
  });
});
