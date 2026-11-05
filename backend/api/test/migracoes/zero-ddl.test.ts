import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listarMigracoes } from '../../src/infraestrutura/db/estado.ts';
import { migrar, PASTA_MIGRACOES } from '../../src/infraestrutura/db/migrar.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';

/**
 * Conta todo DDL do banco num event trigger `ddl_command_start`. O log fica fora de public,
 * para não entrar na contagem de linhas das tabelas da aplicação.
 */
const CONTADOR_DDL = `
  CREATE SCHEMA espiao;
  CREATE TABLE espiao.ddl (id bigserial PRIMARY KEY, tag text NOT NULL);
  CREATE FUNCTION espiao.registrar() RETURNS event_trigger LANGUAGE plpgsql AS $$
  BEGIN
    INSERT INTO espiao.ddl (tag) VALUES (tg_tag);
  END $$;
  CREATE EVENT TRIGGER espiao_ddl ON ddl_command_start EXECUTE FUNCTION espiao.registrar();
`;

async function tagsDdl(url: string): Promise<string[]> {
  return comCliente(url, async (c) =>
    (await c.query<{ tag: string }>('SELECT tag FROM espiao.ddl ORDER BY id')).rows.map(
      (r) => r.tag,
    ),
  );
}

async function contagens(url: string): Promise<Record<string, number>> {
  return comCliente(url, async (c) => {
    const tabelas = await c.query<{ t: string }>(
      `SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
    );
    const r: Record<string, number> = {};
    for (const { t } of tabelas.rows) {
      const q = await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.${c.escapeIdentifier(t)}`,
      );
      r[t] = q.rows[0]?.n ?? 0;
    }
    return r;
  });
}

async function pgmigrations(url: string) {
  return comCliente(
    url,
    async (c) => (await c.query('SELECT id, name, run_on FROM pgmigrations ORDER BY id')).rows,
  );
}

/** Dados de exemplo em tabelas herdadas, para a contagem não ser só de zeros. */
const DADOS = `
  WITH c AS (
    INSERT INTO contas (email, nome, senha_hash, criada_em)
    VALUES ('a@exemplo.test', 'Conta A', 'x', now()) RETURNING id
  )
  INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
  SELECT 'Grupo A', 'grupo-a', 'sabado', 'semanal', '09:00', c.id, now() FROM c;
`;

describe('migrar sobre banco já migrado', () => {
  it('FUN-09: a segunda execução não executa DDL', async () => {
    await bancoDeTeste(
      async (url) => {
        await comCliente(url, (c) => c.query(CONTADOR_DDL));
        expect(await migrar(url)).toEqual([]);
        expect(await tagsDdl(url)).toEqual([]);
      },
      { migrado: true },
    );
  });

  it('FUN-09: contagem de linhas e pgmigrations iguais antes e depois', async () => {
    await bancoDeTeste(
      async (url) => {
        await comCliente(url, (c) => c.query(DADOS));
        const linhasAntes = await contagens(url);
        const registroAntes = await pgmigrations(url);
        expect(Object.values(linhasAntes).some((n) => n > 0)).toBe(true);
        await migrar(url);
        expect(await contagens(url)).toEqual(linhasAntes);
        expect(await pgmigrations(url)).toEqual(registroAntes);
      },
      { migrado: true },
    );
  });

  it('FUN-09: com uma migração nova de exemplo, só ela executa', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'pelada-nova-'));
    try {
      for (const nome of listarMigracoes(PASTA_MIGRACOES)) {
        copyFileSync(join(PASTA_MIGRACOES, `${nome}.sql`), join(pasta, `${nome}.sql`));
      }
      writeFileSync(
        join(pasta, '1799999999999_exemplo-nova.sql'),
        '-- Up Migration\nCREATE TABLE exemplo_nova (id int);\n',
      );
      await bancoDeTeste(
        async (url) => {
          await comCliente(url, (c) => c.query(CONTADOR_DDL));
          expect(await migrar(url, { pasta })).toEqual(['1799999999999_exemplo-nova']);
          expect(await tagsDdl(url)).toEqual(['CREATE TABLE']);
        },
        { migrado: true },
      );
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});
