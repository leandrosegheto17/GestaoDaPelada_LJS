import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp, type Contexto } from './apoio.ts';
import {
  abrirCenarioGrupos,
  type CenarioGrupos,
  type CenarioGruposAberto,
} from './cenario-grupos.ts';

/**
 * Matriz política × comando do financeiro, colunas UPDATE e DELETE, e as células de `vinculos_admin.acessa_financeiro`
 * (T13; FIN-39, FIN-40, FIN-41), como `pelada_app`. Mesmos atores da T12: X = conta do grupo H contra G, P = só o slug
 * de G, N = admin de G sem acesso, C = criadora de G (controle). Com e sem `WHERE`, `UPDATE` e `DELETE` das recusadas
 * afetam zero linhas de G (ou são recusados, no caso de P, "zero linhas ou recusado"), e G fica idêntico.
 *
 * Evidência da rede (registrar na T13 do tasks.md, pelo /executar, uma sabotagem por vez numa cópia do banco migrado):
 * - trocar `*_acesso_financeiro` por `USING (true) WITH CHECK (true)` deixa vermelhas as células P e N de UPDATE e de
 *   DELETE (X continua recusado pelas permissivas herdadas);
 * - recriar a restritiva só com `USING`, sem `WITH CHECK`, deixa vermelha a célula "C move a linha para H";
 * - `DROP POLICY vinculos_admin_trava_financeiro_alterar` deixa vermelhas as células de UPDATE de `vinculos_admin`
 *   (própria conta e N alterando outro); `DROP POLICY vinculos_admin_trava_financeiro_inserir` deixa vermelha a de INSERT.
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

/** UPDATE inócuo e válido (respeita os CHECKs) em cada tabela; `{W}` é o filtro opcional. */
const ALTERAR: Record<Tabela, string> = {
  config_financeira: 'UPDATE config_financeira SET mensalidade_centavos = 1',
  lancamentos: 'UPDATE lancamentos SET valor_centavos = 1',
  pagamentos_mes: 'UPDATE pagamentos_mes SET lancamento_id = NULL',
};

const MOVER_PARA_H = (tabela: Tabela): string =>
  `UPDATE ${tabela} SET grupo_id = $1 WHERE grupo_id = $2`;

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

interface Tentativa {
  linhas: number | null;
  codigo: string | null;
}

/** Roda o comando como `pelada_app`; a transação é desfeita ao fim. */
async function tentar(ctx: Contexto, sql: string, valores: unknown[] = []): Promise<Tentativa> {
  try {
    const r = await comoApp(aberto.db, ctx, (d) => d.query(sql, valores));
    return { linhas: r.rowCount, codigo: null };
  } catch (erro) {
    return { linhas: null, codigo: (erro as { code?: string }).code ?? 'sem código' };
  }
}

/** "Zero linhas ou recusado": nunca afeta linha. */
function semEfeito(t: Tentativa): void {
  expect(t.linhas === 0 || t.codigo === '42501', `resultado ${JSON.stringify(t)}`).toBe(true);
}

const CELULAS = TABELAS.flatMap((tabela) =>
  (['X', 'P', 'N'] as const).map((ator) => [tabela, ator] as const),
);

describe('FIN-40: UPDATE das 3 tabelas', () => {
  it.each(CELULAS)('FIN-40: %s × %s: UPDATE sem WHERE não afeta G', async (tabela, ator) => {
    const { db, cenario } = aberto;
    const antes = await foto(db, cenario.grupoG);
    semEfeito(await tentar(contexto(ator, cenario), ALTERAR[tabela]));
    expect(await foto(db, cenario.grupoG)).toEqual(antes);
  });

  it.each(CELULAS)(
    'FIN-40: %s × %s: UPDATE com WHERE grupo_id = G não afeta G',
    async (tabela, ator) => {
      const { db, cenario } = aberto;
      const antes = await foto(db, cenario.grupoG);
      semEfeito(
        await tentar(contexto(ator, cenario), `${ALTERAR[tabela]} WHERE grupo_id = $1`, [
          cenario.grupoG,
        ]),
      );
      expect(await foto(db, cenario.grupoG)).toEqual(antes);
    },
  );

  it.each(CELULAS)(
    'FIN-40: %s × %s: mover a linha de G para H não afeta G',
    async (tabela, ator) => {
      const { db, cenario } = aberto;
      const antes = await foto(db, cenario.grupoG);
      semEfeito(
        await tentar(contexto(ator, cenario), MOVER_PARA_H(tabela), [
          cenario.grupoH,
          cenario.grupoG,
        ]),
      );
      expect(await foto(db, cenario.grupoG)).toEqual(antes);
    },
  );

  it.each(TABELAS)('FIN-40: %s × C (controle): a criadora com acesso altera G', async (tabela) => {
    const { contaC } = aberto.cenario;
    const t = await tentar({ conta: contaC }, `${ALTERAR[tabela]} WHERE grupo_id = $1`, [
      aberto.cenario.grupoG,
    ]);
    expect(t).toEqual({ linhas: expect.any(Number) as number, codigo: null });
    expect(t.linhas).toBeGreaterThan(0);
  });

  it.each(TABELAS)(
    'FIN-40: %s × C: a criadora com acesso não move a linha de G para H (WITH CHECK)',
    async (tabela) => {
      const { db, cenario } = aberto;
      const antes = await foto(db, cenario.grupoG);
      const t = await tentar({ conta: cenario.contaC }, MOVER_PARA_H(tabela), [
        cenario.grupoH,
        cenario.grupoG,
      ]);
      expect(t.codigo).toBe('42501');
      expect(await foto(db, cenario.grupoG)).toEqual(antes);
    },
  );
});

describe('FIN-40: DELETE das 3 tabelas', () => {
  it.each(CELULAS)('FIN-40: %s × %s: DELETE sem WHERE não afeta G', async (tabela, ator) => {
    const { db, cenario } = aberto;
    const antes = await foto(db, cenario.grupoG);
    semEfeito(await tentar(contexto(ator, cenario), `DELETE FROM ${tabela}`));
    expect(await foto(db, cenario.grupoG)).toEqual(antes);
  });

  it.each(CELULAS)(
    'FIN-40: %s × %s: DELETE com WHERE grupo_id = G não afeta G',
    async (tabela, ator) => {
      const { db, cenario } = aberto;
      const antes = await foto(db, cenario.grupoG);
      semEfeito(
        await tentar(contexto(ator, cenario), `DELETE FROM ${tabela} WHERE grupo_id = $1`, [
          cenario.grupoG,
        ]),
      );
      expect(await foto(db, cenario.grupoG)).toEqual(antes);
    },
  );

  it('FIN-40: C (controle) apaga pagamentos, lançamentos e configuração de G, nessa ordem (a FK protege o vinculado)', async () => {
    const { db, cenario } = aberto;
    const contagens = await comoApp(db, { conta: cenario.contaC }, async (d) => {
      const apagar = async (tabela: Tabela) =>
        (await d.query(`DELETE FROM ${tabela} WHERE grupo_id = $1`, [cenario.grupoG])).rowCount;
      return [
        await apagar('pagamentos_mes'),
        await apagar('lancamentos'),
        await apagar('config_financeira'),
      ];
    });
    expect(contagens.every((n) => (n ?? 0) > 0)).toBe(true);
  });
});

describe('FIN-41: células de vinculos_admin.acessa_financeiro', () => {
  it('FIN-41: SELECT inalterado: os admins do grupo leem os vínculos de G, com e sem acesso ao financeiro', async () => {
    const { db, cenario } = aberto;
    for (const conta of [cenario.contaC, cenario.contaO]) {
      const n = await comoApp(db, { conta }, async (d) => {
        const r = await d.query('SELECT 1 FROM vinculos_admin WHERE grupo_id = $1', [
          cenario.grupoG,
        ]);
        return r.rowCount;
      });
      expect(n).toBe(2);
    }
  });

  it('FIN-41: INSERT: N cria vínculo com acesso e é recusado; C cria e é aceito', async () => {
    const { contaC, contaO, contaB, grupoG } = aberto.cenario;
    const sql = `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
                 VALUES ($1, $2, true, $3, now())`;
    expect((await tentar({ conta: contaO }, sql, [contaB, grupoG, contaO])).codigo).toBe('42501');
    expect(await tentar({ conta: contaC }, sql, [contaB, grupoG, contaC])).toEqual({
      linhas: 1,
      codigo: null,
    });
  });

  it('FIN-41: UPDATE: N altera outro admin (zero linhas); C altera a própria (zero linhas); C altera outro (aceito)', async () => {
    const { contaC, contaO, grupoG } = aberto.cenario;
    const sql =
      'UPDATE vinculos_admin SET acessa_financeiro = $3 WHERE conta_id = $1 AND grupo_id = $2';
    expect(await tentar({ conta: contaO }, sql, [contaC, grupoG, false])).toEqual({
      linhas: 0,
      codigo: null,
    });
    expect(await tentar({ conta: contaC }, sql, [contaC, grupoG, false])).toEqual({
      linhas: 0,
      codigo: null,
    });
    expect(await tentar({ conta: contaC }, sql, [contaO, grupoG, true])).toEqual({
      linhas: 1,
      codigo: null,
    });
  });

  it('FIN-41: DELETE inalterado: a criadora remove o vínculo de outro admin (remoção de admin da CA)', async () => {
    const { contaC, contaO, grupoG } = aberto.cenario;
    const t = await tentar(
      { conta: contaC },
      'DELETE FROM vinculos_admin WHERE conta_id = $1 AND grupo_id = $2',
      [contaO, grupoG],
    );
    expect(t).toEqual({ linhas: 1, codigo: null });
  });
});
