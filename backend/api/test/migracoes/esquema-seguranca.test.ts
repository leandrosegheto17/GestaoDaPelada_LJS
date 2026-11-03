import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { expect, test } from 'vitest';
import { lerEsquema } from '../../src/infraestrutura/db/esquema.ts';
import { bancoDeTeste } from '../apoio/banco.ts';

/* Cada teste cria uma role pelada_t_<aleatório> (roles são do cluster) e a remove no finally. */
async function comMini<T>(fn: (c: pg.Client, role: string) => Promise<T>): Promise<T> {
  const role = `pelada_t_${randomBytes(4).toString('hex')}`;
  return bancoDeTeste(async (url) => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      await c.query(`
        create role ${role} nologin;
        create table t (id int primary key, dono int, segredo text);
        create function f(x int) returns int language sql as $$ select x + 1 $$;
        grant select on t to ${role};
        grant update (segredo) on t to ${role};
        alter table t enable row level security;
        create policy ler on t for select to ${role} using (dono = 1);
      `);
      return await fn(c, role);
    } finally {
      await c.query(`drop owned by ${role}`).catch(() => undefined);
      await c.query(`drop role if exists ${role}`).catch(() => undefined);
      await c.end();
    }
  });
}

/** Aplica o DDL, relê e confere que a saída mudou (cada categoria prova a sua, de forma independente). */
async function mudaSaida(
  c: pg.Client,
  ddl: string,
): Promise<{ antes: string[]; depois: string[] }> {
  const antes = await lerEsquema(c);
  await c.query(ddl);
  return { antes, depois: await lerEsquema(c) };
}

test('FUN-08: funcao: assinatura, security definer, search_path e corpo entram na saída', async () => {
  await comMini(async (c) => {
    const base = await lerEsquema(c);
    const corpo = createHash('md5').update(' select x + 1 ').digest('hex');
    expect(base).toContain(
      `funcao f(x integer) returns integer language=sql securitydefiner=false config=none corpo=${corpo}`,
    );
    for (const ddl of [
      'create or replace function f(x int) returns int language sql as $$ select x + 2 $$',
      'alter function f(int) security definer',
      'alter function f(int) set search_path = public, pg_temp',
    ]) {
      const { antes, depois } = await mudaSaida(c, ddl);
      expect(depois, ddl).not.toEqual(antes);
    }
  });
});

test('FUN-08: policy: mudar o USING, o WITH CHECK, o comando ou as roles muda a saída', async () => {
  await comMini(async (c, role) => {
    expect(await lerEsquema(c)).toContain(
      `policy t.ler cmd=SELECT roles=${role} using=(dono = 1) check=none`,
    );
    for (const ddl of [
      'alter policy ler on t using (true)',
      'alter policy ler on t to public',
      'drop policy ler on t',
    ]) {
      const base = await lerEsquema(c);
      await c.query('begin');
      await c.query(ddl);
      expect(await lerEsquema(c), ddl).not.toEqual(base);
      await c.query('rollback');
    }
    await c.query(`create policy ins on t for insert to ${role} with check (dono = 1)`);
    expect(await lerEsquema(c)).toContain(
      `policy t.ins cmd=INSERT roles=${role} using=none check=(dono = 1)`,
    );
  });
});

test('FUN-08: rls: ENABLE e FORCE entram na saída', async () => {
  await comMini(async (c) => {
    expect(await lerEsquema(c)).toContain('rls t enable=true force=false');
    const { antes, depois } = await mudaSaida(c, 'alter table t force row level security');
    expect(depois).not.toEqual(antes);
    expect(depois).toContain('rls t enable=true force=true');
    const sem = await mudaSaida(c, 'alter table t disable row level security');
    expect(sem.depois).toContain('rls t enable=false force=true');
  });
});

test('FUN-08: grants de tabela e de coluna por role entram na saída', async () => {
  await comMini(async (c, role) => {
    const base = await lerEsquema(c);
    expect(base).toContain(`grant tabela t ${role} SELECT`);
    expect(base).toContain(`grant coluna t.segredo ${role} UPDATE`);
    const a = await mudaSaida(c, `grant delete on t to ${role}`);
    expect(a.depois).toContain(`grant tabela t ${role} DELETE,SELECT`);
    const b = await mudaSaida(c, `revoke update (segredo) on t from ${role}`);
    expect(b.depois.some((l) => l.startsWith('grant coluna'))).toBe(false);
    const d = await mudaSaida(c, `grant execute on function f(int) to ${role}`);
    expect(d.depois).toContain(`grant funcao f(x integer) ${role} EXECUTE`);
  });
});

test('FUN-08: role pelada_*: BYPASSRLS e LOGIN mudam a saída; só a senha não muda', async () => {
  await comMini(async (c, role) => {
    expect(await lerEsquema(c)).toContain(
      `role ${role} login=false bypassrls=false superuser=false createdb=false createrole=false replication=false`,
    );
    const senha = await mudaSaida(c, `alter role ${role} password 'abc'`);
    expect(senha.depois).toEqual(senha.antes);
    const senha2 = await mudaSaida(c, `alter role ${role} password 'outra'`);
    expect(senha2.depois).toEqual(senha2.antes);
    const login = await mudaSaida(c, `alter role ${role} login`);
    expect(login.depois).not.toEqual(login.antes);
    const bypass = await mudaSaida(c, `alter role ${role} bypassrls`);
    expect(bypass.depois).not.toEqual(bypass.antes);
  });
});

test('FUN-08: roles que não são pelada_* não entram na saída', async () => {
  await comMini(async (c) => {
    const linhas = await lerEsquema(c);
    expect(
      linhas.filter((l) => l.startsWith('role ')).every((l) => l.startsWith('role pelada_')),
    ).toBe(true);
  });
});

test('FUN-08: extensões entram na saída', async () => {
  await comMini(async (c) => {
    expect(await lerEsquema(c)).toContain('extensao plpgsql');
    const { antes, depois } = await mudaSaida(c, 'create extension if not exists pgcrypto');
    expect(depois).not.toEqual(antes);
    expect(depois).toContain('extensao pgcrypto');
  });
});

test('FUN-08: funções de extensão não aparecem como funcao', async () => {
  await comMini(async (c) => {
    await c.query('create extension if not exists pgcrypto');
    expect((await lerEsquema(c)).filter((l) => l.startsWith('funcao ')).length).toBe(1);
  });
});
