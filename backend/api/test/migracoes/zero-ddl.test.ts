import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, expect, test } from 'vitest';
import { migrar, PASTA_MIGRACOES } from '../../src/infraestrutura/db/migrar.ts';
import { bancoDeTeste } from '../apoio/banco.ts';

const temporarias: string[] = [];
afterAll(() => temporarias.forEach((p) => rmSync(p, { recursive: true, force: true })));

async function comBanco<T>(fn: (c: pg.Client, url: string) => Promise<T>): Promise<T> {
  return bancoDeTeste(async (url) => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      return await fn(c, url);
    } finally {
      await c.end();
    }
  });
}

/** Event trigger que registra cada comando DDL em `ddl_log` (superusuário, como nas migrações locais). */
async function instalarContadorDeDdl(c: pg.Client): Promise<void> {
  await c.query(`
    create schema contador;
    create table contador.ddl_log (id serial primary key, tag text);
    create function contador.ddl_registrar() returns event_trigger language plpgsql as $$
      begin insert into contador.ddl_log (tag) values (tg_tag); end $$;
    create event trigger ddl_contador on ddl_command_start execute function contador.ddl_registrar();
  `);
}

const ddls = async (c: pg.Client) =>
  (await c.query<{ n: number }>('select count(*)::int as n from contador.ddl_log')).rows[0]!.n;

async function contagens(c: pg.Client): Promise<Record<string, number>> {
  const { rows } = await c.query<{ t: string }>(
    "select tablename as t from pg_tables where schemaname = 'public' order by 1",
  );
  const r: Record<string, number> = {};
  for (const { t } of rows) {
    r[t] = (await c.query<{ n: number }>(`select count(*)::int as n from "${t}"`)).rows[0]!.n;
  }
  return r;
}

test('FUN-09: segunda execução de migrar sobre as 23 aplicadas não executa nenhum DDL', async () => {
  await comBanco(async (c, url) => {
    await instalarContadorDeDdl(c);
    await migrar(url);
    expect(await ddls(c), 'controle positivo: a primeira execução tem DDL').toBeGreaterThan(100);
    await c.query('truncate contador.ddl_log');
    expect(await migrar(url)).toEqual([]);
    expect(await ddls(c)).toBe(0);
  });
}, 90_000);

test('FUN-09: a segunda execução deixa a contagem de linhas por tabela e a pgmigrations iguais', async () => {
  await comBanco(async (c, url) => {
    await migrar(url);
    const antes = {
      contagens: await contagens(c),
      historico: (await c.query('select id, name, run_on from pgmigrations order by id')).rows,
    };
    await migrar(url);
    expect(await contagens(c)).toEqual(antes.contagens);
    expect((await c.query('select id, name, run_on from pgmigrations order by id')).rows).toEqual(
      antes.historico,
    );
    expect(Object.keys(antes.contagens)).toHaveLength(26);
  });
}, 90_000);

test('FUN-09: com uma migração nova de exemplo, só ela executa', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'zero-ddl-'));
  temporarias.push(dir);
  for (const nome of readdirSync(PASTA_MIGRACOES).filter((n) => n.endsWith('.sql'))) {
    copyFileSync(resolve(PASTA_MIGRACOES, nome), resolve(dir, nome));
  }
  writeFileSync(
    resolve(dir, '1792844600000_exemplo.sql'),
    '-- Up Migration\ncreate table exemplo (id int primary key);\n',
  );
  await comBanco(async (c, url) => {
    await migrar(url);
    await instalarContadorDeDdl(c);
    expect(await migrar(url, { dir })).toEqual(['1792844600000_exemplo']);
    expect(await ddls(c)).toBe(1);
    expect((await c.query('select tag from contador.ddl_log')).rows).toEqual([
      { tag: 'CREATE TABLE' },
    ]);
    const { rows } = await c.query<{ name: string }>('select name from pgmigrations order by id');
    expect(rows).toHaveLength(24);
    expect(rows.at(-1)!.name).toBe('1792844600000_exemplo');
  });
}, 90_000);
