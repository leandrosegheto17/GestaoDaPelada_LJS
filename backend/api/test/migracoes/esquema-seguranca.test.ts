import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { describe, expect, test } from 'vitest';
import { lerEsquema } from '../../src/infraestrutura/db/esquema.ts';
import { comBancoDeTeste } from '../apoio/banco.ts';

const sufixo = () => randomBytes(4).toString('hex');

/** Banco de teste com uma role `pelada_t_<x>` (global do cluster), removida no finally. */
async function comMini<T>(corpo: (c: pg.Client, role: string) => Promise<T>): Promise<T> {
  const role = `pelada_t_${sufixo()}`;
  return comBancoDeTeste(async (url) => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      await c.query(`
        create role ${role} nologin;
        create table dono (id int primary key, grupo_id int not null, segredo text);
        create function dobro(x int) returns int language sql security definer
          set search_path = public as $$ select x * 2 $$;
        alter table dono enable row level security;
        create policy ver on dono for select to ${role} using (grupo_id = 1);
        grant select (id) on dono to ${role};
        grant select on dono to ${role};
      `);
      return await corpo(c, role);
    } finally {
      await c.query(`drop owned by ${role}`).catch(() => undefined);
      await c.query(`drop role if exists ${role}`).catch(() => undefined);
      await c.end();
    }
  });
}

const so = (linhas: string[], prefixo: string, trecho = '') =>
  linhas.filter((l) => l.startsWith(prefixo) && l.includes(trecho));

describe('lerEsquema: funções, policies, grants e roles', () => {
  test('FUN-08: função mostra assinatura, SECURITY DEFINER, search_path e hash do corpo', async () => {
    await comMini(async (c) => {
      const antes = so(await lerEsquema(c), 'funcao ');
      expect(antes).toHaveLength(1);
      expect(antes[0]).toMatch(
        /^funcao public\.dobro\(x integer\) security=definer config=search_path=public corpo=[0-9a-f]{64}$/,
      );

      await c.query(
        'create or replace function dobro(x int) returns int language sql security definer set search_path = public as $$ select x * 3 $$',
      );
      const corpo = so(await lerEsquema(c), 'funcao ');
      expect(corpo).not.toEqual(antes);

      await c.query('alter function dobro(int) set search_path = pg_temp');
      expect(so(await lerEsquema(c), 'funcao ')).not.toEqual(corpo);
    });
  }, 30_000);

  test('FUN-08: policy mostra comando, roles, USING e WITH CHECK; mudar a expressão muda a saída', async () => {
    await comMini(async (c, role) => {
      const antes = so(await lerEsquema(c), 'policy ');
      expect(antes).toEqual([
        `policy public.dono.ver permissive cmd=r roles=${role} using=(grupo_id = 1) check=-`,
      ]);
      await c.query('alter policy ver on dono using (true)');
      expect(so(await lerEsquema(c), 'policy ')).not.toEqual(antes);
    });
  }, 30_000);

  test('FUN-08: RLS e FORCE por tabela; ligar o FORCE muda a saída', async () => {
    await comMini(async (c) => {
      expect(so(await lerEsquema(c), 'rls ')).toEqual(['rls public.dono enabled=t force=f']);
      await c.query('alter table dono force row level security');
      expect(so(await lerEsquema(c), 'rls ')).toEqual(['rls public.dono enabled=t force=t']);
    });
  }, 30_000);

  test('FUN-08: grants de tabela e de coluna por role; novo GRANT muda a saída', async () => {
    await comMini(async (c, role) => {
      const antes = await lerEsquema(c);
      expect(so(antes, 'grant ', role)).toEqual([`grant public.dono ${role} SELECT`]);
      expect(so(antes, 'grant-coluna ', role)).toEqual([
        `grant-coluna public.dono.id ${role} SELECT`,
      ]);
      await c.query(`grant insert on dono to ${role}`);
      expect(so(await lerEsquema(c), 'grant ', role)).not.toEqual(so(antes, 'grant ', role));
    });
  }, 30_000);

  test('FUN-08: atributos de role pelada_* (BYPASSRLS, LOGIN) mudam a saída; a senha não', async () => {
    await comMini(async (c, role) => {
      const base = so(await lerEsquema(c), 'role ', role);
      expect(base).toEqual([
        `role ${role} login=f bypassrls=f superuser=f createdb=f createrole=f inherit=t`,
      ]);
      await c.query(`alter role ${role} login`);
      const login = so(await lerEsquema(c), 'role ', role);
      expect(login).not.toEqual(base);
      await c.query(`alter role ${role} bypassrls`);
      expect(so(await lerEsquema(c), 'role ', role)).not.toEqual(login);
      await c.query(`alter role ${role} password 'senha-nova'`);
      expect(so(await lerEsquema(c), 'role ', role)).not.toEqual(login); // continua com bypassrls
      const comSenha = so(await lerEsquema(c), 'role ', role);
      await c.query(`alter role ${role} password 'outra-senha'`);
      expect(so(await lerEsquema(c), 'role ', role)).toEqual(comSenha);
    });
  }, 30_000);

  test('FUN-08: extensões instaladas aparecem', async () => {
    await comMini(async (c) => {
      expect(so(await lerEsquema(c), 'extensao ')).toEqual(['extensao plpgsql']);
      await c.query('create extension pgcrypto');
      expect(so(await lerEsquema(c), 'extensao ')).toEqual([
        'extensao pgcrypto',
        'extensao plpgsql',
      ]);
    });
  }, 30_000);
});
