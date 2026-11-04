import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { expect, test } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migrar.ts';
import { comBancoDeTeste, comTravaDeMigracao } from '../apoio/banco.ts';

/** Liga um event trigger que registra todo comando DDL. Deve ser o último DDL antes de medir. */
async function ligarContadorDeDdl(c: pg.Client) {
  await c.query(`
    create table ddl_contagem (tag text, consulta text);
    create function registrar_ddl() returns event_trigger language plpgsql as $$
      begin insert into ddl_contagem values (tg_tag, current_query()); end $$;
    create event trigger contar_ddl on ddl_command_start execute function registrar_ddl();
  `);
}

async function contagens(c: pg.Client) {
  const tabelas = (
    await c.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and tablename <> 'ddl_contagem' order by 1",
    )
  ).rows.map((r) => r.tablename);
  const out: Record<string, number> = {};
  for (const t of tabelas) {
    out[t] = (await c.query<{ n: number }>(`select count(*)::int as n from "${t}"`)).rows[0]!.n;
  }
  return out;
}

test('FUN-09: segunda execução de migrar sobre as 23 aplicadas não executa DDL e não muda linhas', async () => {
  await comBancoDeTeste(async (url) => {
    await comTravaDeMigracao(() => migrar(url));
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      const antes = await contagens(c);
      await ligarContadorDeDdl(c);

      const aplicadas = await comTravaDeMigracao(() => migrar(url));

      expect(aplicadas).toEqual([]);
      const ddl = (await c.query('select tag, consulta from ddl_contagem')).rows;
      expect(ddl).toEqual([]);
      expect(await contagens(c)).toEqual(antes);
      expect(antes.pgmigrations ?? 0).toBe(23);
    } finally {
      await c.end();
    }
  });
}, 120_000);

test('FUN-09: com uma migração nova de exemplo, só ela executa', async () => {
  const nova = mkdtempSync(join(tmpdir(), 'pelada-zero-ddl-'));
  try {
    await comBancoDeTeste(async (url) => {
      await comTravaDeMigracao(() => migrar(url));
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      try {
        await ligarContadorDeDdl(c);
        // a pasta de exemplo é a das 23 + uma nova: só a nova roda
        const { copyFileSync, readdirSync } = await import('node:fs');
        const { PASTA } = await import('./pasta.ts');
        for (const f of readdirSync(PASTA).filter((n) => n.endsWith('.sql'))) {
          copyFileSync(join(PASTA, f), join(nova, f));
        }
        writeFileSync(
          join(nova, '1792844580000_exemplo-nova.sql'),
          'create table exemplo_nova (x int);',
        );

        const aplicadas = await comTravaDeMigracao(() => migrar(url, { pasta: nova }));
        expect(aplicadas).toEqual(['1792844580000_exemplo-nova']);
        const ddl = (await c.query<{ tag: string }>('select tag from ddl_contagem')).rows;
        expect(ddl.map((r) => r.tag)).toEqual(['CREATE TABLE']);
      } finally {
        await c.end();
      }
    });
  } finally {
    rmSync(nova, { recursive: true, force: true });
  }
}, 120_000);
