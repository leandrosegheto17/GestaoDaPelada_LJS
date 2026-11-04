import pg from 'pg';
import { describe, expect, test } from 'vitest';
import { lerEsquema } from '../../src/infraestrutura/db/esquema.ts';
import { comBancoDeTeste } from '../apoio/banco.ts';

const MINI = `
  create table pai (id int primary key, nome text not null default 'x');
  create table filho (id int generated always as identity primary key, pai_id int not null references pai(id));
  create index filho_pai_idx on filho(pai_id);
  create function f() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger t_filho before insert on filho for each row execute function f();
  create table pgmigrations (id int primary key);
`;

async function comMini<T>(sql: string, corpo: (c: pg.Client) => Promise<T>): Promise<T> {
  return comBancoDeTeste(async (url) => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      await c.query(sql);
      return await corpo(c);
    } finally {
      await c.end();
    }
  });
}

describe('lerEsquema: estrutura', () => {
  test('FUN-08: mini schema (2 tabelas, FK, índice, trigger) dá a lista esperada', async () => {
    await comMini(MINI, async (c) => {
      const linhas = (await lerEsquema(c)).filter((l) =>
        /^(tabela|coluna|restricao|indice|trigger) /.test(l),
      );
      expect(linhas).toEqual([
        'coluna public.filho.id integer not null identity=a',
        'coluna public.filho.pai_id integer not null',
        'coluna public.pai.id integer not null',
        "coluna public.pai.nome text not null default 'x'::text",
        'indice public.filho.filho_pai_idx CREATE INDEX filho_pai_idx ON public.filho USING btree (pai_id)',
        'indice public.filho.filho_pkey CREATE UNIQUE INDEX filho_pkey ON public.filho USING btree (id)',
        'indice public.pai.pai_pkey CREATE UNIQUE INDEX pai_pkey ON public.pai USING btree (id)',
        'restricao public.filho.filho_pai_id_fkey FOREIGN KEY (pai_id) REFERENCES pai(id)',
        'restricao public.filho.filho_pkey PRIMARY KEY (id)',
        'restricao public.pai.pai_pkey PRIMARY KEY (id)',
        'tabela public.filho',
        'tabela public.pai',
        'trigger public.filho.t_filho CREATE TRIGGER t_filho BEFORE INSERT ON public.filho FOR EACH ROW EXECUTE FUNCTION f()',
      ]);
    });
  }, 30_000);

  test('FUN-08: ignora a tabela pgmigrations', async () => {
    await comMini(MINI, async (c) => {
      expect((await lerEsquema(c)).some((l) => l.includes('pgmigrations'))).toBe(false);
    });
  }, 30_000);

  test('FUN-08: mudar o tipo de uma coluna ou apagar um índice muda a saída', async () => {
    await comMini(MINI, async (c) => {
      const base = await lerEsquema(c);
      await c.query('alter table pai alter column nome type varchar(10)');
      const mudouTipo = await lerEsquema(c);
      expect(mudouTipo).not.toEqual(base);
      await c.query('drop index filho_pai_idx');
      expect(await lerEsquema(c)).not.toEqual(mudouTipo);
    });
  }, 30_000);

  test('FUN-08: a saída é estável entre duas leituras seguidas', async () => {
    await comMini(MINI, async (c) => {
      expect(await lerEsquema(c)).toEqual(await lerEsquema(c));
    });
  }, 30_000);
});
