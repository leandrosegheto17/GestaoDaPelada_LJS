import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, comoApp, type CenarioAberto } from './apoio.ts';
import { MATRIZ, type CasoMatriz } from './matriz.ts';

/**
 * Matriz de leitura (FUN-13): para cada caso da matriz, o SELECT de `pelada_app` com a
 * conta A, a conta B e uma conta sem vínculo. A fonte dos casos é a mesma do meta-teste.
 */

let aberto: CenarioAberto;

beforeAll(async () => {
  aberto = await abrirCenario();
  // As tabelas do financeiro só são lidas por quem tem o acesso (FIN-41, `app_acessa_financeiro`); esta matriz compara
  // grupos, e a trava do financeiro tem testes próprios (`financeiro-rls*.test.ts`).
  await aberto.db.query('UPDATE vinculos_admin SET acessa_financeiro = true');
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Grupos distintos das linhas que a conexão enxerga na tabela, ordenados, e o total de linhas. */
async function visto(
  db: pg.Client,
  caso: CasoMatriz,
): Promise<{ grupos: string[]; linhas: number }> {
  const coluna = db.escapeIdentifier(caso.coluna);
  const r = await db.query<{ g: string }>(
    `SELECT ${coluna}::text AS g FROM ${db.escapeIdentifier(caso.tabela)}`,
  );
  return { grupos: [...new Set(r.rows.map((l) => l.g))].sort(), linhas: r.rowCount ?? 0 };
}

/** Linhas do grupo na tabela, contadas pelo superusuário (sem RLS). */
async function linhasDoGrupo(db: pg.Client, caso: CasoMatriz, grupo: string): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${db.escapeIdentifier(caso.tabela)} WHERE ${db.escapeIdentifier(caso.coluna)} = $1`,
    [grupo],
  );
  return r.rows[0]?.n ?? 0;
}

const porGrupo = MATRIZ.filter((c) => c.leitura === 'por-grupo');
const semGrant = MATRIZ.filter((c) => c.leitura === 'sem-grant');

describe.each(porGrupo)('FUN-13: SELECT em $tabela', (caso) => {
  it('FUN-13: a conta A lê só as linhas do grupo A, e todas elas', async () => {
    const { db, cenario } = aberto;
    const v = await comoApp(db, { conta: cenario.contaA }, (d) => visto(d, caso));
    expect(v.grupos).toEqual([cenario.grupoA]);
    expect(v.linhas).toBe(await linhasDoGrupo(db, caso, cenario.grupoA));
  });

  it('FUN-13: a conta B lê só as linhas do grupo B, e todas elas', async () => {
    const { db, cenario } = aberto;
    const v = await comoApp(db, { conta: cenario.contaB }, (d) => visto(d, caso));
    expect(v.grupos).toEqual([cenario.grupoB]);
    expect(v.linhas).toBe(await linhasDoGrupo(db, caso, cenario.grupoB));
  });

  it('FUN-13: a conta sem vínculo lê zero linhas', async () => {
    const { db, cenario } = aberto;
    const v = await comoApp(db, { conta: cenario.contaSemVinculo }, (d) => visto(d, caso));
    expect(v).toEqual({ grupos: [], linhas: 0 });
  });

  it('FUN-13: a conta A com o slug do grupo B continua lendo só o grupo A (o slug é ignorado)', async () => {
    const { db, cenario } = aberto;
    const v = await comoApp(db, { conta: cenario.contaA, slug: cenario.slugB }, (d) =>
      visto(d, caso),
    );
    expect(v.grupos).toEqual([cenario.grupoA]);
  });
});

describe.each(semGrant)('FUN-13: SELECT em $tabela, sem grant para pelada_app', (caso) => {
  it.each([
    ['conta A', 'contaA'],
    ['conta B', 'contaB'],
    ['conta sem vínculo', 'contaSemVinculo'],
  ] as const)('FUN-13: %s recebe erro de permissão na tabela', async (_nome, chave) => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario[chave] }, (d) => visto(d, caso)),
    ).rejects.toMatchObject({
      code: '42501',
      message: expect.stringContaining(`permission denied for table ${caso.tabela}`),
    });
  });
});

describe('FUN-13: a matriz de leitura pega uma policy aberta', () => {
  it('FUN-13: com USING (true) em jogadores_ler, a conta A passa a ver o grupo B; revertido, volta ao grupo A', async () => {
    const { db, cenario } = aberto;
    const caso = MATRIZ.find((c) => c.tabela === 'jogadores');
    if (!caso) throw new Error('jogadores fora da matriz');

    // A troca da policy e a leitura ficam na mesma transação, desfeita no fim: a policy
    // original volta sem depender de um ALTER de reversão.
    await db.query('BEGIN');
    let aberta: { grupos: string[] };
    try {
      await db.query('ALTER POLICY jogadores_ler ON jogadores USING (true)');
      await db.query('SET LOCAL ROLE pelada_app');
      await db.query(`SELECT set_config('app.conta_id', $1, true)`, [cenario.contaA]);
      aberta = await visto(db, caso);
    } finally {
      await db.query('ROLLBACK');
    }
    expect(aberta.grupos).toEqual([cenario.grupoA, cenario.grupoB].sort());
    expect(aberta.grupos).not.toEqual([cenario.grupoA]);

    const revertida = await comoApp(db, { conta: cenario.contaA }, (d) => visto(d, caso));
    expect(revertida.grupos).toEqual([cenario.grupoA]);
  });
});
