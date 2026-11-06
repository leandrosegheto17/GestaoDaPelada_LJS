import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, comoApp, type CenarioAberto, type Contexto } from './apoio.ts';
import {
  conteudo,
  escritaDe,
  ident as q,
  idsDoGrupo,
  RLS,
  SEM_GRANT,
  tentar,
  type IdsDoGrupo,
  type Tentativa,
} from './casos-escrita.ts';
import { MATRIZ, type CasoMatriz } from './matriz.ts';

/**
 * Contexto público e sem contexto (FUN-14, FUN-15). Com só o slug, `pelada_app` lê as linhas
 * do grupo do slug e nunca escreve; sem contexto nenhum, lê zero linhas.
 *
 * SPEC_DEVIATION herdado (1792843380000_conta-tabelas.sql): a leitura de `convites_admin` exige
 * conta, porque o convite traz o e-mail de quem foi convidado. Com só o slug, ela devolve zero.
 */
// Também exigem conta: o caixa (FIN-39, `app_acessa_financeiro`), a escalação (SIM-81), os eventos (PAR-129) e a
// assinatura do plano (`assinaturas_ler`, PLA-32).
const LEITURA_EXIGE_CONTA = new Set([
  'convites_admin',
  'config_financeira',
  'lancamentos',
  'pagamentos_mes',
  'escalacoes',
  'eventos_uso',
  'assinaturas',
]);

let aberto: CenarioAberto;
let idsA: IdsDoGrupo;
let antesA: Record<string, string>;

beforeAll(async () => {
  aberto = await abrirCenario();
  idsA = await idsDoGrupo(aberto.db, aberto.cenario.grupoA);
  antesA = await conteudo(aberto.db, aberto.cenario.grupoA);
});

afterAll(async () => {
  await aberto?.fechar();
});

async function gruposVistos(db: pg.Client, caso: CasoMatriz): Promise<string[]> {
  const r = await db.query<{ g: string }>(
    `SELECT ${q(db, caso.coluna)}::text AS g FROM ${q(db, caso.tabela)}`,
  );
  return [...new Set(r.rows.map((l) => l.g))].sort();
}

const porGrupo = MATRIZ.filter((c) => c.leitura === 'por-grupo');
const semGrant = MATRIZ.filter((c) => c.leitura === 'sem-grant');

const CONTEXTOS: ReadonlyArray<readonly [string, (c: CenarioAberto['cenario']) => Contexto]> = [
  ['só o slug do grupo A', (c) => ({ slug: c.slugA })],
  ['sem contexto', () => ({})],
];

describe.each(porGrupo)('FUN-14: SELECT em $tabela com só o slug', (caso) => {
  it('FUN-14: com o slug do grupo A e sem conta, devolve só linhas do grupo A', async () => {
    const { db, cenario } = aberto;
    const vistos = await comoApp(db, { slug: cenario.slugA }, (d) => gruposVistos(d, caso));
    expect(vistos).toEqual(LEITURA_EXIGE_CONTA.has(caso.tabela) ? [] : [cenario.grupoA]);
  });

  it('FUN-14: com o slug do grupo B, devolve só linhas do grupo B', async () => {
    const { db, cenario } = aberto;
    const vistos = await comoApp(db, { slug: cenario.slugB }, (d) => gruposVistos(d, caso));
    expect(vistos).toEqual(LEITURA_EXIGE_CONTA.has(caso.tabela) ? [] : [cenario.grupoB]);
  });

  it('FUN-14: com um slug que não existe, devolve zero linhas', async () => {
    const { db } = aberto;
    expect(
      await comoApp(db, { slug: 'grupo-que-nao-existe' }, (d) => gruposVistos(d, caso)),
    ).toEqual([]);
  });
});

describe.each(porGrupo)('FUN-15: SELECT em $tabela sem contexto', (caso) => {
  it('FUN-15: sem conta e sem slug, devolve zero linhas', async () => {
    const { db } = aberto;
    expect(await comoApp(db, {}, (d) => gruposVistos(d, caso))).toEqual([]);
  });
});

describe.each(semGrant)('FUN-14, FUN-15: SELECT em $tabela, sem grant para pelada_app', (caso) => {
  it.each(CONTEXTOS)('FUN-14, FUN-15: %s recebe erro de permissão', async (_nome, contexto) => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, contexto(cenario), (d) => gruposVistos(d, caso)),
    ).rejects.toMatchObject({
      code: '42501',
      message: expect.stringContaining(`permission denied for table ${caso.tabela}`),
    });
  });
});

describe('FUN-15: tabelas de conta sem contexto', () => {
  it.each(['contas', 'sessoes'])('FUN-15: %s devolve zero linhas sem conta', async (tabela) => {
    const { db } = aberto;
    const n = await comoApp(
      db,
      {},
      async (d) => (await d.query(`SELECT id FROM ${q(d, tabela)}`)).rowCount,
    );
    expect(n).toBe(0);
  });
});

function esperaRecusa(t: Tentativa, motivo: RegExp): void {
  expect(t.erro?.code, t.erro?.message ?? `afetou ${t.linhas} linha(s)`).toBe('42501');
  expect(t.erro?.message).toMatch(motivo);
  expect(t.observado).toEqual(antesA);
}

function esperaZero(t: Tentativa): void {
  expect(t.erro, t.erro?.message).toBeNull();
  expect(t.linhas).toBe(0);
  expect(t.observado).toEqual(antesA);
}

describe.each(MATRIZ)('FUN-14, FUN-15: escrita em $tabela sem conta', (caso) => {
  const e = escritaDe(caso);
  const col = caso.coluna;
  const tab = caso.tabela;

  describe.each(CONTEXTOS)('%s', (_nome, contexto) => {
    const como = (sql: string, valores: unknown[] = []) =>
      tentar(aberto.db, contexto(aberto.cenario), aberto.cenario.grupoA, sql, valores);

    it('FUN-14: INSERT no grupo A é recusado', async () => {
      const { cenario } = aberto;
      const [sql, valores] = e.inserir(cenario.grupoA, cenario.contaA, idsA);
      esperaRecusa(await como(sql, valores), e.insere ? RLS : SEM_GRANT);
    });

    it('FUN-14: UPDATE com WHERE no grupo A afeta zero linhas', async () => {
      const { db, cenario } = aberto;
      const t = await como(`UPDATE ${q(db, tab)} SET ${e.alterar} WHERE ${q(db, col)} = $1`, [
        cenario.grupoA,
      ]);
      if (e.altera) esperaZero(t);
      else esperaRecusa(t, SEM_GRANT);
    });

    it('FUN-14: UPDATE sem WHERE afeta zero linhas', async () => {
      const { db } = aberto;
      const t = await como(`UPDATE ${q(db, tab)} SET ${e.alterar}`);
      if (e.altera) esperaZero(t);
      else esperaRecusa(t, SEM_GRANT);
    });

    it('FUN-14: DELETE sem WHERE afeta zero linhas', async () => {
      const { db } = aberto;
      const t = await como(`DELETE FROM ${q(db, tab)}`);
      if (e.apaga) esperaZero(t);
      else esperaRecusa(t, SEM_GRANT);
    });
  });
});
