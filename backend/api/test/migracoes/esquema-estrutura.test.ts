import pg from 'pg';
import { expect, test } from 'vitest';
import { lerEsquema } from '../../src/infraestrutura/db/esquema.ts';
import { bancoDeTeste } from '../apoio/banco.ts';

const MINI = `
  create table a (id int primary key, nome text not null default 'x');
  create table b (
    id bigint generated always as identity primary key,
    a_id int not null references a (id),
    valor numeric(10,2)
  );
  create index b_valor_idx on b (valor);
  create function f() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger b_trg before insert on b for each row execute function f();
`;

async function comMini<T>(ddl: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  return bancoDeTeste(async (url) => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      await c.query(ddl);
      return await fn(c);
    } finally {
      await c.end();
    }
  });
}

const ESPERADO = [
  'tabela a',
  'tabela b',
  'coluna a.id integer notnull=true default=none identity=none generated=none',
  "coluna a.nome text notnull=true default='x'::text identity=none generated=none",
  'coluna b.id bigint notnull=true default=none identity=always generated=none',
  'coluna b.a_id integer notnull=true default=none identity=none generated=none',
  'coluna b.valor numeric(10,2) notnull=false default=none identity=none generated=none',
  'restricao a.a_pkey PRIMARY KEY (id)',
  'restricao b.b_pkey PRIMARY KEY (id)',
  'restricao b.b_a_id_fkey FOREIGN KEY (a_id) REFERENCES a(id)',
  'indice a.a_pkey CREATE UNIQUE INDEX a_pkey ON public.a USING btree (id)',
  'indice b.b_pkey CREATE UNIQUE INDEX b_pkey ON public.b USING btree (id)',
  'indice b.b_valor_idx CREATE INDEX b_valor_idx ON public.b USING btree (valor)',
  'trigger b.b_trg CREATE TRIGGER b_trg BEFORE INSERT ON public.b FOR EACH ROW EXECUTE FUNCTION f()',
].sort();

test('FUN-08: um mini schema (2 tabelas, FK, índice, trigger) gera a lista esperada, escrita à mão', async () => {
  const linhas = await comMini(MINI, (c) => lerEsquema(c));
  // As categorias de segurança (T20) têm teste próprio; roles e extensões dependem do cluster.
  const estrutura = linhas.filter((l) => /^(tabela|coluna|restricao|indice|trigger) /.test(l));
  expect(estrutura).toEqual(ESPERADO);
});

test('FUN-08: duas leituras seguidas dão a mesma lista', async () => {
  await comMini(MINI, async (c) => {
    expect(await lerEsquema(c)).toEqual(await lerEsquema(c));
  });
});

test('FUN-08: mudar o tipo de uma coluna muda a saída', async () => {
  await comMini(MINI, async (c) => {
    const antes = await lerEsquema(c);
    await c.query('alter table a alter column nome type varchar(20)');
    const depois = await lerEsquema(c);
    expect(depois).not.toEqual(antes);
    expect(depois.some((l) => l.startsWith('coluna a.nome character varying(20)'))).toBe(true);
  });
});

test('FUN-08: apagar um índice, uma restrição ou um trigger muda a saída', async () => {
  await comMini(MINI, async (c) => {
    const base = await lerEsquema(c);
    for (const ddl of [
      'drop index b_valor_idx',
      'alter table b drop constraint b_a_id_fkey',
      'drop trigger b_trg on b',
    ]) {
      await c.query('begin');
      await c.query(ddl);
      expect(await lerEsquema(c), ddl).not.toEqual(base);
      await c.query('rollback');
    }
    expect(await lerEsquema(c)).toEqual(base);
  });
});

test('FUN-08: a tabela pgmigrations é ignorada', async () => {
  await comMini(`${MINI} create table pgmigrations (id int primary key);`, async (c) => {
    expect((await lerEsquema(c)).some((l) => l.includes('pgmigrations'))).toBe(false);
  });
});
