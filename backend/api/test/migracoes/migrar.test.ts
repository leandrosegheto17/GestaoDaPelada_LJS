import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, expect, test } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migrar.ts';
import { bancoDeTeste } from '../apoio/banco.ts';

const pastaOficial = resolve(import.meta.dirname, '../../src/infraestrutura/db/migracoes');
const nomesOficiais = readdirSync(pastaOficial)
  .filter((n) => n.endsWith('.sql'))
  .sort()
  .map((n) => n.replace(/\.sql$/, ''));

const temporarias: string[] = [];
afterAll(() => temporarias.forEach((p) => rmSync(p, { recursive: true, force: true })));

async function consultar<T extends pg.QueryResultRow>(url: string, sql: string): Promise<T[]> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query<T>(sql)).rows;
  } finally {
    await c.end();
  }
}

test('FUN-07: banco vazio, depois migrar: pgmigrations tem os 23 nomes na ordem dos arquivos', async () => {
  await bancoDeTeste(async (url) => {
    await migrar(url);
    const linhas = await consultar<{ name: string }>(
      url,
      'select name from pgmigrations order by id',
    );
    expect(linhas.map((l) => l.name)).toEqual(nomesOficiais);
    expect(nomesOficiais).toHaveLength(23);
  });
}, 60_000);

test('FUN-07: migração que falha no meio não deixa DDL parcial dela, e as anteriores ficam aplicadas', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'migracoes-'));
  temporarias.push(dir);
  writeFileSync(
    resolve(dir, '1000000000001_ok.sql'),
    '-- Up Migration\ncreate table a (id int);\n',
  );
  writeFileSync(
    resolve(dir, '1000000000002_falha.sql'),
    '-- Up Migration\ncreate table b (id int);\nselect 1/0;\n',
  );
  await bancoDeTeste(async (url) => {
    await expect(migrar(url, { dir })).rejects.toThrow();
    const tabelas = await consultar<{ t: string }>(
      url,
      "select tablename as t from pg_tables where schemaname = 'public' and tablename <> 'pgmigrations' order by 1",
    );
    expect(tabelas.map((l) => l.t)).toEqual(['a']);
    const aplicadas = await consultar<{ name: string }>(url, 'select name from pgmigrations');
    expect(aplicadas.map((l) => l.name)).toEqual(['1000000000001_ok']);
  });
}, 60_000);

test('FUN-07: duas execuções simultâneas de migrar aplicam cada migração uma vez', async () => {
  await bancoDeTeste(async (url) => {
    await Promise.all([migrar(url), migrar(url)]);
    const linhas = await consultar<{ name: string }>(
      url,
      'select name from pgmigrations order by id',
    );
    expect(linhas.map((l) => l.name)).toEqual(nomesOficiais);
  });
}, 90_000);

test('FUN-07: ignora arquivos que não são .sql na pasta de migrações', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'migracoes-'));
  temporarias.push(dir);
  writeFileSync(
    resolve(dir, '1000000000001_ok.sql'),
    '-- Up Migration\ncreate table a (id int);\n',
  );
  writeFileSync(resolve(dir, 'migracoes.sha256'), 'qualquer coisa\n');
  writeFileSync(resolve(dir, 'esquema-producao.txt'), 'qualquer coisa\n');
  await bancoDeTeste(async (url) => {
    await migrar(url, { dir });
    const aplicadas = await consultar<{ name: string }>(url, 'select name from pgmigrations');
    expect(aplicadas.map((l) => l.name)).toEqual(['1000000000001_ok']);
  });
}, 60_000);
