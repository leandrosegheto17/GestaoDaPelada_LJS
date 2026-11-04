// Casos limite de FUN-10 (estados do banco antes de migrar):
//   vazio | 23 aplicadas | prefixo (20 de 23) | nome desconhecido | ordem trocada
//   | tabelas sem pgmigrations | pgmigrations vazia com tabelas
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, test } from 'vitest';
import { detectarEstado } from '../../src/infraestrutura/db/estado.ts';
import { lerEsquema } from '../../src/infraestrutura/db/esquema.ts';
import { EstadoDivergente, migrar } from '../../src/infraestrutura/db/migrar.ts';
import { comBancoDeTeste } from '../apoio/banco.ts';

const TRES = {
  '1_a.sql': 'create table a (x int);',
  '2_b.sql': 'create table b (x int);',
  '3_c.sql': 'create table c (x int);',
};

function pastaCom(arquivos: Record<string, string>) {
  const pasta = mkdtempSync(join(tmpdir(), 'pelada-estado-'));
  for (const [nome, sql] of Object.entries(arquivos)) writeFileSync(join(pasta, nome), sql);
  return pasta;
}

async function comPasta<T>(
  arquivos: Record<string, string>,
  corpo: (url: string, pasta: string, c: pg.Client) => Promise<T>,
) {
  const pasta = pastaCom(arquivos);
  try {
    return await comBancoDeTeste(async (url) => {
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      try {
        return await corpo(url, pasta, c);
      } finally {
        await c.end();
      }
    });
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

const PGMIGRATIONS =
  'create table pgmigrations (id serial primary key, name varchar(255) not null, run_on timestamp not null default now())';

describe('detectarEstado', () => {
  test('FUN-10: banco vazio é vazio', async () => {
    await comPasta(TRES, async (_u, pasta, c) => {
      expect(await detectarEstado(c, pasta)).toEqual({ estado: 'vazio', diferencas: [] });
    });
  }, 30_000);

  test('FUN-10: pgmigrations vazia e sem outras tabelas ainda é vazio', async () => {
    await comPasta(TRES, async (_u, pasta, c) => {
      await c.query(PGMIGRATIONS);
      expect((await detectarEstado(c, pasta)).estado).toBe('vazio');
    });
  }, 30_000);

  test('FUN-10: todas aplicadas é gerenciado', async () => {
    await comPasta(TRES, async (url, pasta, c) => {
      await migrar(url, { pasta });
      expect(await detectarEstado(c, pasta)).toEqual({ estado: 'gerenciado', diferencas: [] });
    });
  }, 30_000);

  test('FUN-10: prefixo das migrações aplicado (2 de 3) é gerenciado e segue para a execução', async () => {
    await comPasta(TRES, async (url, pasta, c) => {
      const duas = pastaCom({ '1_a.sql': TRES['1_a.sql'], '2_b.sql': TRES['2_b.sql'] });
      try {
        await migrar(url, { pasta: duas });
      } finally {
        rmSync(duas, { recursive: true, force: true });
      }
      expect((await detectarEstado(c, pasta)).estado).toBe('gerenciado');
      expect(await migrar(url, { pasta })).toEqual(['3_c']);
    });
  }, 30_000);

  test('FUN-10: nome desconhecido na pgmigrations é divergente e lista o nome', async () => {
    await comPasta(TRES, async (url, pasta, c) => {
      await migrar(url, { pasta });
      await c.query("insert into pgmigrations (name, run_on) values ('9_estranha', now())");
      const r = await detectarEstado(c, pasta);
      expect(r.estado).toBe('divergente');
      expect(r.diferencas.join('\n')).toContain('9_estranha');
    });
  }, 30_000);

  test('FUN-10: ordem trocada na pgmigrations é divergente e lista a posição', async () => {
    await comPasta(TRES, async (url, pasta, c) => {
      await migrar(url, { pasta });
      await c.query("update pgmigrations set name = '__t' where name = '1_a'");
      await c.query("update pgmigrations set name = '1_a' where name = '2_b'");
      await c.query("update pgmigrations set name = '2_b' where name = '__t'");
      const r = await detectarEstado(c, pasta);
      expect(r.estado).toBe('divergente');
      expect(r.diferencas.join('\n')).toMatch(/posição 1.*1_a.*2_b/s);
    });
  }, 30_000);

  test('FUN-10: tabelas sem pgmigrations é divergente e lista as tabelas', async () => {
    await comPasta(TRES, async (_u, pasta, c) => {
      await c.query('create table solta (x int)');
      const r = await detectarEstado(c, pasta);
      expect(r.estado).toBe('divergente');
      expect(r.diferencas.join('\n')).toContain('solta');
    });
  }, 30_000);

  test('FUN-10: pgmigrations vazia com tabelas é divergente', async () => {
    await comPasta(TRES, async (_u, pasta, c) => {
      await c.query(PGMIGRATIONS);
      await c.query('create table solta (x int)');
      expect((await detectarEstado(c, pasta)).estado).toBe('divergente');
    });
  }, 30_000);
});

describe('migrar com banco divergente', () => {
  test('FUN-10: aborta antes de qualquer escrita, lista as diferenças e não muda esquema nem contagens', async () => {
    await comPasta(TRES, async (url, pasta, c) => {
      await c.query('create table solta (x int)');
      await c.query('insert into solta values (1), (2)');
      const antes = await lerEsquema(c, { roles: [] });

      const erro = await migrar(url, { pasta }).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(EstadoDivergente);
      expect((erro as EstadoDivergente).diferencas.join('\n')).toContain('solta');
      expect((erro as Error).message).toContain('solta');

      expect(await lerEsquema(c, { roles: [] })).toEqual(antes);
      expect((await c.query('select count(*)::int as n from solta')).rows[0].n).toBe(2);
      expect((await c.query("select to_regclass('pgmigrations') as t")).rows[0].t).toBeNull();
    });
  }, 30_000);
});
