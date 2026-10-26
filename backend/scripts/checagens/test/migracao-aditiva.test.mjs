import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const PASTA = resolve(import.meta.dirname, '..');
const temporarias = [];

function criar(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'aditiva-'));
  temporarias.push(raiz);
  for (const [nome, texto] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, nome)), { recursive: true });
    writeFileSync(join(raiz, nome), texto);
  }
  return raiz;
}

const rodar = (script, ...args) => spawnSync(process.execPath, [join(PASTA, script), ...args], { encoding: 'utf8' });

afterEach(() => {
  while (temporarias.length) rmSync(temporarias.pop(), { recursive: true, force: true });
});

describe('checar-migracao-aditiva (FUN-54)', () => {
  const status = (sql) => rodar('checar-migracao-aditiva.mjs', criar({ '202610010000_x.sql': sql })).status;

  it.each([
    'CREATE TABLE t (id integer, valor bigint);',
    'ALTER TABLE t ADD COLUMN nota integer;',
    '-- drop table x\nCREATE TABLE t (id int);',
    '/* DROP TABLE x */ CREATE TABLE t (id int);',
    "INSERT INTO t VALUES ('DROP TABLE x');",
    'CREATE FUNCTION f() RETURNS void AS $$ BEGIN DROP TABLE x; END $$ LANGUAGE plpgsql;',
    'CREATE TABLE t ("drop" int);',
    '-- contrair: remover coluna antiga depois do deploy\nALTER TABLE t DROP COLUMN velha;',
    'ALTER TABLE t ADD COLUMN c integer NOT NULL DEFAULT 0;',
    'ALTER TABLE t ALTER COLUMN c SET DEFAULT 0; ALTER TABLE t ALTER COLUMN c SET NOT NULL;',
    '/* a /* aninhado */ ainda comentário */ CREATE TABLE t (id int);',
  ])('passa: %s', (sql) => {
    expect(status(sql)).toBe(0);
  });

  it.each([
    'DROP TABLE t;',
    'drop   \n table t;',
    'DrOp TABLE t;',
    'ALTER TABLE t RENAME TO u;',
    'ALTER TABLE t RENAME COLUMN a TO b;',
    'ALTER TABLE t ALTER COLUMN c TYPE bigint;',
    'ALTER TABLE t ALTER COLUMN c SET DATA TYPE bigint;',
    'ALTER TABLE t ALTER COLUMN c SET NOT NULL;',
    'ALTER TABLE t ADD COLUMN c integer NOT NULL;',
    'CREATE TABLE t (v money);',
    'CREATE TABLE t (v REAL);',
    'CREATE TABLE t (v double\nprecision);',
    'CREATE TABLE t (v float8);',
    'CREATE TABLE t (v numeric(10,2));',
    '-- contrair:\nDROP TABLE t;',
    '/* um /* dois */ DROP TABLE t;',
    '',
    '-- só comentário',
  ])('falha: %j', (sql) => {
    expect(status(sql)).toBe(1);
  });

  it('pasta inexistente falha fechado e pasta vazia passa', () => {
    expect(rodar('checar-migracao-aditiva.mjs', join(tmpdir(), 'nao-existe-xyz')).status).toBe(2);
    expect(rodar('checar-migracao-aditiva.mjs', criar({ 'LEIA.txt': 'x' })).status).toBe(0);
  });

  it('aponta o arquivo e a linha', () => {
    const r = rodar('checar-migracao-aditiva.mjs', criar({ '202610010000_x.sql': 'SELECT 1;\n\nDROP TABLE t;' }));
    expect(r.stderr).toContain('202610010000_x.sql:3');
  });

  it('reconhece o nome de arquivo do node-pg-migrate (timestamp em ms) e barra migration não aditiva', () => {
    const r = rodar(
      'checar-migracao-aditiva.mjs',
      criar({ '1761300000000_remove-coluna.sql': 'SELECT 1;\nALTER TABLE t DROP COLUMN velha;' }),
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('1761300000000_remove-coluna.sql:2');
  });

  it('aceita a migration não aditiva com a exceção declarada ("-- contrair:") no nome do node-pg-migrate', () => {
    const arquivos = {
      '1761300000001_contrai.sql': '-- contrair: ADR-024 remove a coluna velha\nALTER TABLE t DROP COLUMN velha;',
    };
    expect(rodar('checar-migracao-aditiva.mjs', criar(arquivos)).status).toBe(0);
  });
});
