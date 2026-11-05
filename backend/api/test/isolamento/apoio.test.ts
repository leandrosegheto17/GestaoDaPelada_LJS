import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bancoDeTeste, comCliente, URL_TESTE_PADRAO } from '../apoio/banco.ts';
import { abrirCenario, comCenario, comoApp, criarCenario, type CenarioAberto } from './apoio.ts';

const URL_BASE = process.env.DATABASE_URL_TESTE ?? URL_TESTE_PADRAO;

async function bancoExiste(nome: string): Promise<boolean> {
  return comCliente(URL_BASE, async (c) => {
    const r = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [nome]);
    return r.rowCount === 1;
  });
}

describe('apoio de isolamento', () => {
  let aberto: CenarioAberto;

  beforeAll(async () => {
    aberto = await abrirCenario();
  });

  afterAll(async () => {
    await aberto?.fechar();
  });

  it('FUN-13: comoApp com a conta A enxerga o grupo de A e não o de B em grupos', async () => {
    const { db, cenario } = aberto;
    const ids = await comoApp(db, { conta: cenario.contaA }, async (d) =>
      (await d.query<{ id: string }>('SELECT id FROM grupos')).rows.map((r) => r.id),
    );
    expect(ids).toEqual([cenario.grupoA]);
  });

  it('FUN-16: comoApp roda como pelada_app com o contexto e o desfaz ao fim', async () => {
    const { db, cenario } = aberto;
    const dentro = await comoApp(
      db,
      { conta: cenario.contaA },
      async (d) =>
        (
          await d.query<{ papel: string; conta: string }>(
            `SELECT current_user AS papel, current_setting('app.conta_id', true) AS conta`,
          )
        ).rows[0],
    );
    expect(dentro).toEqual({ papel: 'pelada_app', conta: cenario.contaA });

    const depois = (
      await db.query<{ papel: string; conta: string | null }>(
        `SELECT current_user AS papel, nullif(current_setting('app.conta_id', true), '') AS conta`,
      )
    ).rows[0];
    expect(depois).toEqual({ papel: 'postgres', conta: null });
  });

  it('FUN-16: quando fn lança erro, comoApp desfaz a transação e a role', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, async (d) => {
        await d.query(`UPDATE jogadores SET apelido = 'Alterado' WHERE grupo_id = $1`, [
          cenario.grupoA,
        ]);
        throw new Error('falha de propósito');
      }),
    ).rejects.toThrow('falha de propósito');

    const papel = (await db.query<{ papel: string }>('SELECT current_user AS papel')).rows[0]
      ?.papel;
    expect(papel).toBe('postgres');
    const alterados = await db.query(`SELECT 1 FROM jogadores WHERE apelido = 'Alterado'`);
    expect(alterados.rowCount).toBe(0);
  });

  it('FUN-17: o cenário cria ao menos uma linha por grupo em cada tabela com grupo_id do catálogo', async () => {
    const { db, cenario } = aberto;
    const nomes = cenario.tabelas.map((t) => t.tabela);
    expect(nomes).toEqual(
      expect.arrayContaining(['grupos', 'convites_admin', 'auditoria', 'eventos_uso']),
    );
    expect(nomes.length).toBeGreaterThanOrEqual(16);

    for (const { tabela, coluna } of cenario.tabelas) {
      const r = await db.query<{ a: number; b: number }>(
        `SELECT count(*) FILTER (WHERE ${db.escapeIdentifier(coluna)} = $1)::int AS a,
                count(*) FILTER (WHERE ${db.escapeIdentifier(coluna)} = $2)::int AS b
           FROM ${db.escapeIdentifier(tabela)}`,
        [cenario.grupoA, cenario.grupoB],
      );
      expect(r.rows[0]?.a, `${tabela}: linhas do grupo A`).toBeGreaterThanOrEqual(1);
      expect(r.rows[0]?.b, `${tabela}: linhas do grupo B`).toBeGreaterThanOrEqual(1);
    }
  });

  it('FUN-17: tabela com grupo_id no catálogo sem linha no cenário faz criarCenario falhar', async () => {
    await bancoDeTeste(
      async (url) =>
        comCliente(url, async (db) => {
          await db.query('CREATE TABLE tabela_nova (id int PRIMARY KEY, grupo_id uuid)');
          await expect(criarCenario(db)).rejects.toThrow(/tabela_nova/);
        }),
      { migrado: true },
    );
  });

  it('FUN-19: o banco do cenário é removido no finally, mesmo quando o corpo lança erro', async () => {
    let nome = '';
    await expect(
      comCenario(async (_db, _cenario, banco) => {
        nome = banco.nome;
        throw new Error('falha de propósito');
      }),
    ).rejects.toThrow('falha de propósito');
    expect(nome).toMatch(/^teste_/);
    expect(await bancoExiste(nome)).toBe(false);
  });

  it('FUN-19: abrirCenario remove o banco no fechar', async () => {
    const outro = await abrirCenario();
    expect(await bancoExiste(outro.nome)).toBe(true);
    await outro.fechar();
    expect(await bancoExiste(outro.nome)).toBe(false);
  });
});
