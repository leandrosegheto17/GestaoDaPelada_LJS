import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp, type Contexto } from './apoio.ts';
import { abrirCenarioGrupos, type CenarioGrupos, type CenarioGruposAberto } from './cenario-grupos.ts';

/**
 * Matriz política × comando do financeiro, colunas SELECT e INSERT (T12; FIN-38, FIN-39, FIN-40), como `pelada_app`.
 * 3 tabelas × 3 atores, uma célula por teste, mais o controle C e o contexto vazio. Atores (grupos G e H do cenário):
 * - X = conta do grupo H contra as linhas de G (FUN-17);
 * - P = só o contexto público do slug de G (FIN-38);
 * - N = admin de G com `acessa_financeiro` falso (FIN-39);
 * - C = criadora de G, com acesso: controle positivo (lê e escreve).
 * Cada recusa confere que o conteúdo de G ficou idêntico (foto de G como superusuário antes e depois).
 * As colunas UPDATE e DELETE e a trava da coluna de `vinculos_admin` são da T13.
 *
 * Evidência da rede (registrar na T12 do tasks.md, pelo /executar, uma sabotagem por vez numa cópia do banco migrado):
 * - trocar `*_acesso_financeiro` por `USING (true) WITH CHECK (true)` deixa vermelhas as células P e N de SELECT e de
 *   INSERT (X continua recusado pelas permissivas herdadas, que é a segunda barreira);
 * - recriar a restritiva sem `WITH CHECK` deixa vermelhas as células N e P de INSERT;
 * - `DROP POLICY *_acesso_financeiro` (o estado de antes da T9) deixa vermelhas as mesmas células.
 */

const TABELAS = ['config_financeira', 'lancamentos', 'pagamentos_mes'] as const;
type Tabela = (typeof TABELAS)[number];

type Ator = 'X' | 'P' | 'N';

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

function contexto(ator: Ator, c: CenarioGrupos): Contexto {
  if (ator === 'X') return { conta: c.contaB };
  if (ator === 'P') return { slug: c.slugG };
  return { conta: c.contaO };
}

/** Conta que assina a linha tentada: a do próprio ator, ou a criadora quando o ator não tem conta (P). */
function autora(ator: Ator, c: CenarioGrupos): string {
  return ator === 'X' ? c.contaB : ator === 'N' ? c.contaO : c.contaC;
}

/** INSERT de uma linha nova em G, no formato de cada tabela. */
function inserir(tabela: Tabela, c: CenarioGrupos, conta: string): [string, unknown[]] {
  if (tabela === 'config_financeira') {
    return [
      `INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial)
       VALUES ($1, 9000, 0, '2026-02-01')`,
      [c.grupoG],
    ];
  }
  if (tabela === 'lancamentos') {
    return [
      `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'saida', '2026-02-10', 'Intruso', 1000, $2, now(), $2, now())`,
      [c.grupoG, conta],
    ];
  }
  return [
    `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
     VALUES ($1, $2, '2026-05', NULL, $3, now())`,
    [c.grupoG, c.idsG.jogadorAtivo, conta],
  ];
}

/** Conteúdo de G nas 3 tabelas, como texto JSON ordenado. Exige superusuário. */
async function foto(db: pg.Client, grupo: string): Promise<Record<Tabela, string>> {
  const f = {} as Record<Tabela, string>;
  for (const tabela of TABELAS) {
    const r = await db.query<{ j: string }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)::text AS j
         FROM ${tabela} t WHERE t.grupo_id = $1`,
      [grupo],
    );
    f[tabela] = r.rows[0]?.j ?? '';
  }
  return f;
}

async function linhasDeG(ctx: Contexto, tabela: Tabela): Promise<number> {
  const { db, cenario } = aberto;
  return comoApp(db, ctx, async (d) => {
    const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabela} WHERE grupo_id = $1`, [cenario.grupoG]);
    return r.rows[0]?.n ?? -1;
  });
}

const CELULAS = TABELAS.flatMap((tabela) => (['X', 'P', 'N'] as const).map((ator) => [tabela, ator] as const));

describe('FIN-40: SELECT das 3 tabelas', () => {
  it.each(CELULAS)('FIN-40: %s × %s: zero linhas de G', async (tabela, ator) => {
    expect(await linhasDeG(contexto(ator, aberto.cenario), tabela)).toBe(0);
  });

  it.each(TABELAS)('FIN-40: %s × C (controle): a criadora com acesso lê as linhas de G', async (tabela) => {
    expect(await linhasDeG({ conta: aberto.cenario.contaC }, tabela)).toBeGreaterThan(0);
  });

  it.each(TABELAS)('FIN-38: %s sem conta e sem slug: zero linhas em toda a tabela', async (tabela) => {
    const { db } = aberto;
    const n = await comoApp(db, {}, async (d) => (await d.query(`SELECT 1 FROM ${tabela}`)).rowCount);
    expect(n).toBe(0);
  });
});

describe('FIN-40: INSERT das 3 tabelas', () => {
  it.each(CELULAS)('FIN-40: %s × %s: INSERT em G recusado e G fica idêntico', async (tabela, ator) => {
    const { db, cenario } = aberto;
    const antes = await foto(db, cenario.grupoG);
    const [sql, valores] = inserir(tabela, cenario, autora(ator, cenario));
    await expect(comoApp(db, contexto(ator, cenario), (d) => d.query(sql, valores))).rejects.toMatchObject({
      code: '42501',
    });
    expect(await foto(db, cenario.grupoG)).toEqual(antes);
  });

  it.each(TABELAS)('FIN-40: %s × C (controle): a criadora com acesso insere em G', async (tabela) => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaC }, async (d) => {
      // A configuração é uma linha por grupo: sai a de G dentro da transação desfeita para o INSERT valer.
      if (tabela === 'config_financeira') await d.query('DELETE FROM config_financeira WHERE grupo_id = $1', [cenario.grupoG]);
      const [sql, valores] = inserir(tabela, cenario, cenario.contaC);
      return d.query(sql, valores);
    });
    expect(r.rowCount).toBe(1);
  });

  it('FIN-40: lançamento de G assinado por N com a criadora como autora também é recusado', async () => {
    const { db, cenario } = aberto;
    const [sql, valores] = inserir('lancamentos', cenario, cenario.contaC);
    await expect(comoApp(db, { conta: cenario.contaO }, (d) => d.query(sql, valores))).rejects.toMatchObject({
      code: '42501',
    });
  });
});
