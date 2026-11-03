import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, expect, test } from 'vitest';
import { detectarEstado } from '../../src/infraestrutura/db/estado.ts';
import { lerEsquema } from '../../src/infraestrutura/db/esquema.ts';
import { migrar, PASTA_MIGRACOES } from '../../src/infraestrutura/db/migrar.ts';
import { bancoDeTeste } from '../apoio/banco.ts';

/*
 * Casos limite e estados (T22, FUN-10), listados antes do código:
 *  1 banco vazio                                   -> vazio, migra
 *  2 pgmigrations existe e vazia, sem tabelas      -> vazio, migra
 *  3 as 23 aplicadas                               -> gerenciado, nada a fazer
 *  4 as 20 primeiras aplicadas (prefixo)           -> gerenciado, migra o resto
 *  5 nome registrado que não existe nos arquivos   -> divergente
 *  6 mesmos nomes, ordem trocada                   -> divergente
 *  7 tabelas e nenhuma pgmigrations                -> divergente
 *  8 pgmigrations vazia e com tabelas              -> divergente
 *  9 mais nomes registrados que arquivos           -> divergente (é o caso 5)
 */
const nomes = readdirSync(PASTA_MIGRACOES)
  .filter((n) => n.endsWith('.sql'))
  .sort()
  .map((n) => n.replace(/\.sql$/, ''));

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

const TABELA_PGMIGRATIONS =
  'create table pgmigrations (id serial primary key, name varchar(255) not null, run_on timestamp not null)';

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

async function fotografia(c: pg.Client) {
  // roles são do cluster e variam com testes em paralelo
  const esquema = (await lerEsquema(c)).filter((l) => !l.startsWith('role '));
  return { esquema, contagens: await contagens(c) };
}

function primeiras(n: number): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'prefixo-'));
  temporarias.push(dir);
  for (const nome of nomes.slice(0, n))
    copyFileSync(resolve(PASTA_MIGRACOES, `${nome}.sql`), resolve(dir, `${nome}.sql`));
  return dir;
}

test('FUN-10: banco vazio e pgmigrations vazia sem tabelas são "vazio"', async () => {
  await comBanco(async (c) => {
    expect((await detectarEstado(c, nomes)).estado).toBe('vazio');
    await c.query(TABELA_PGMIGRATIONS);
    expect((await detectarEstado(c, nomes)).estado).toBe('vazio');
  });
});

test('FUN-10: as 23 aplicadas e o prefixo de 20 são "gerenciado"', async () => {
  await comBanco(async (c, url) => {
    await migrar(url, { dir: primeiras(20) });
    expect((await detectarEstado(c, nomes)).estado).toBe('gerenciado');
    await migrar(url);
    expect((await detectarEstado(c, nomes)).estado).toBe('gerenciado');
  });
}, 60_000);

test('FUN-10: prefixo de 20 segue para a execução e termina com as 23', async () => {
  await comBanco(async (c, url) => {
    await migrar(url, { dir: primeiras(20) });
    const aplicadas = await migrar(url);
    expect(aplicadas).toHaveLength(3);
    const { rows } = await c.query<{ name: string }>('select name from pgmigrations order by id');
    expect(rows.map((r) => r.name)).toEqual(nomes);
  });
}, 60_000);

const DIVERGENTES: [string, string[], RegExp][] = [
  [
    'nome registrado que não existe nos arquivos',
    ["insert into pgmigrations (name, run_on) values ('9999999999999_desconhecida', now())"],
    /9999999999999_desconhecida/,
  ],
  [
    'ordem trocada',
    [
      `update pgmigrations set name = 'x' where id = 1`,
      `update pgmigrations set name = '${nomes[0]}' where id = 2`,
      `update pgmigrations set name = '${nomes[1]}' where id = 1`,
    ],
    /ordem/i,
  ],
];

test.each(DIVERGENTES)(
  'FUN-10: %s aborta com a lista de diferenças e deixa esquema e contagens idênticos',
  async (_nome, comandos, padrao) => {
    await comBanco(async (c, url) => {
      await migrar(url);
      for (const sql of comandos) await c.query(sql);
      const antes = await fotografia(c);
      const migracoesAntes = (await c.query('select id, name from pgmigrations order by id')).rows;
      const e = await migrar(url).catch((erro: Error) => erro);
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toMatch(padrao);
      expect(await fotografia(c)).toEqual(antes);
      expect((await c.query('select id, name from pgmigrations order by id')).rows).toEqual(
        migracoesAntes,
      );
    });
  },
  60_000,
);

test('FUN-10: tabelas sem pgmigrations abortam sem criar a pgmigrations', async () => {
  await comBanco(async (c, url) => {
    await c.query('create table x (id int); insert into x values (1)');
    const antes = await fotografia(c);
    await expect(migrar(url)).rejects.toThrow(/nenhuma pgmigrations.*\bx\b/s);
    expect(await fotografia(c)).toEqual(antes);
    expect((await c.query("select to_regclass('public.pgmigrations') as t")).rows[0]!.t).toBeNull();
  });
});

test('FUN-10: pgmigrations vazia com tabelas aborta e não altera nada', async () => {
  await comBanco(async (c, url) => {
    await c.query(`${TABELA_PGMIGRATIONS}; create table x (id int)`);
    const antes = await fotografia(c);
    await expect(migrar(url)).rejects.toThrow(/vazia/);
    expect(await fotografia(c)).toEqual(antes);
  });
});

test('FUN-10: banco vazio segue para a execução', async () => {
  await comBanco(async (_c, url) => {
    expect(await migrar(url)).toHaveLength(23);
  });
}, 60_000);
