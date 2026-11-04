import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, test } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migrar.ts';
import { comBancoDeTeste } from '../apoio/banco.ts';
import { PASTA } from './pasta.ts';

async function consulta<T extends pg.QueryResultRow>(url: string, sql: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query<T>(sql)).rows;
  } finally {
    await c.end();
  }
}

function pastaCom(arquivos: Record<string, string>) {
  const pasta = mkdtempSync(join(tmpdir(), 'pelada-migr-'));
  for (const [nome, sql] of Object.entries(arquivos)) writeFileSync(join(pasta, nome), sql);
  return pasta;
}

describe('migrar', () => {
  test('FUN-07: banco vazio, depois migrar: pgmigrations tem os 23 nomes na ordem dos arquivos', async () => {
    await comBancoDeTeste(async (url) => {
      await migrar(url);
      const esperado = readdirSync(PASTA)
        .filter((n) => n.endsWith('.sql'))
        .sort()
        .map((n) => n.replace(/\.sql$/, ''));
      const rows = await consulta<{ name: string }>(
        url,
        'select name from pgmigrations order by id',
      );
      expect(rows.map((r) => r.name)).toEqual(esperado);
      expect(esperado).toHaveLength(23);
    });
  }, 120_000);

  test('FUN-07: migração que falha no meio não deixa DDL parcial dessa migração', async () => {
    const pasta = pastaCom({
      '1_primeira.sql': 'create table a (x int);',
      '2_quebra.sql': 'create table b (x int); select 1/0;',
    });
    try {
      await comBancoDeTeste(async (url) => {
        await expect(migrar(url, { pasta })).rejects.toThrow();
        const tabelas = await consulta<{ tablename: string }>(
          url,
          "select tablename from pg_tables where schemaname = 'public' and tablename in ('a','b')",
        );
        expect(tabelas.map((t) => t.tablename)).toEqual(['a']);
        const feitas = await consulta<{ name: string }>(url, 'select name from pgmigrations');
        expect(feitas.map((r) => r.name)).toEqual(['1_primeira']);
      });
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  }, 60_000);

  test('FUN-07: duas execuções simultâneas aplicam cada migração uma vez', async () => {
    const pasta = pastaCom({
      '1_a.sql': 'create table a (x int); select pg_sleep(0.5);',
      '2_b.sql': 'create table b (x int);',
    });
    try {
      await comBancoDeTeste(async (url) => {
        await Promise.all([migrar(url, { pasta }), migrar(url, { pasta })]);
        const feitas = await consulta<{ name: string }>(
          url,
          'select name from pgmigrations order by id',
        );
        expect(feitas.map((r) => r.name)).toEqual(['1_a', '2_b']);
      });
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  }, 60_000);

  test('AD-009: as migrações rodam como superusuário postgres num banco local vazio', async () => {
    await comBancoDeTeste(async (url) => {
      await migrar(url);
      const [dono] = await consulta<{ dono: string }>(
        url,
        "select tableowner as dono from pg_tables where tablename = 'pgmigrations'",
      );
      expect(dono!.dono).toBe('postgres');
    });
  }, 120_000);
});
