import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { CASOS } from './casos.ts';

let banco: BancoTemporario;
let cliente: pg.Client;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

/** `grupos` e toda tabela de `public` com a coluna grupo_id. */
async function tabelasIsolaveis(): Promise<string[]> {
  const { rows } = await cliente.query<{ t: string }>(
    `SELECT c.relname AS t
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND (c.relname = 'grupos' OR EXISTS (
              SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'grupo_id' AND NOT a.attisdropped))
      ORDER BY 1`,
  );
  return rows.map((r) => r.t);
}

const semCaso = (tabelas: string[]) => tabelas.filter((t) => !(t in CASOS));

describe('a suíte de isolamento cobre toda tabela com grupo_id (FUN-17)', () => {
  it('toda tabela com grupo_id do schema migrado tem caso, e todo caso é de uma tabela que existe', async () => {
    const tabelas = await tabelasIsolaveis();
    expect(semCaso(tabelas)).toEqual([]);
    expect(Object.keys(CASOS).sort()).toEqual(tabelas);
  });

  it('uma tabela nova com grupo_id e sem caso é apontada', async () => {
    await cliente.query('BEGIN');
    try {
      await cliente.query('CREATE TABLE tabela_sem_caso (id int, grupo_id uuid)');
      expect(semCaso(await tabelasIsolaveis())).toEqual(['tabela_sem_caso']);
    } finally {
      await cliente.query('ROLLBACK');
    }
  });
});
