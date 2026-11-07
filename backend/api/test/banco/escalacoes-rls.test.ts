import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, comoApp, type CenarioAberto } from '../isolamento/apoio.ts';

/**
 * Rede de proteção do simulador e matriz política × comando de `escalacoes` (T0; SIM-81, SIM-69, SIM-72).
 * Tabela: `1792843200000_linha-de-base.sql` (escalacoes); grants: `1792843260000_roles.sql:22-31`; policies: laço de
 * `1792843320000_rls.sql:51-56` (`grupo_id IN grupos_visiveis()`, escrita só com conta). Duas migrações desta feature
 * estreitam isso com policies RESTRICTIVE: `1793919878922_escalacoes-leitura-so-conta.sql` (o slug público não lê,
 * AD-122) e `1794004229184_escalacoes-confirmada-por-da-conta.sql` (`confirmada_por` é a conta da sessão, A-14).
 *
 * Cenário da fundação: conta A com o grupo A, conta B com o grupo B, uma escalação de 2026-01-03 em cada grupo.
 * Cada caso roda como `pelada_app` numa transação desfeita ao fim (`comoApp`), e a fotografia das linhas do B, lida
 * como superusuário na mesma transação depois do `RESET ROLE`, tem de ser igual antes e depois.
 *
 * Evidência da rede (registrar na T0 do tasks.md, pelo /executar): `CREATE POLICY escalacoes_aberta ON escalacoes FOR
 * SELECT TO pelada_app USING (true)` temporária deixa vermelho "SIM-81: SELECT da conta A vê só as escalações do A".
 *
 * A matriz do tasks.md pede "slug público zero" no SELECT. A policy do laço usa `grupos_visiveis()`, cujo ramo do slug
 * devolve o grupo do slug (FUN-14); a decisão do usuário (AD-122, 2026-11-05) foi valer a matriz, com a migração
 * `escalacoes_ler_so_conta`: o teste do slug lê zero linhas.
 */

let aberto: CenarioAberto;

beforeAll(async () => {
  aberto = await abrirCenario();
});

afterAll(async () => {
  await aberto?.fechar();
});

interface LinhaEscalacao {
  id: string;
  grupo_id: string;
  data: string;
  formato: string;
  n: number;
  k: number | null;
}

/** As escalações do grupo, lidas como superusuário (depois do `RESET ROLE`, dentro da mesma transação). */
async function fotografia(d: pg.Client, grupo: string): Promise<LinhaEscalacao[]> {
  await d.query('RESET ROLE');
  const r = await d.query<LinhaEscalacao>(
    `SELECT id, grupo_id, data::text AS data, formato, n, k FROM escalacoes WHERE grupo_id = $1 ORDER BY id`,
    [grupo],
  );
  return r.rows;
}

async function inserir(
  d: pg.Client,
  grupo: string,
  conta: string,
  data = '2026-02-07',
): Promise<pg.QueryResult> {
  return d.query(
    `INSERT INTO escalacoes (grupo_id, data, formato, n, k, composicao, confirmada_por, confirmada_em)
     VALUES ($1, $2, 'dois_times', 7, 2, '{"times": [], "naoEntra": []}'::jsonb, $3, now())`,
    [grupo, data, conta],
  );
}

describe('escalacoes: SELECT', () => {
  it('SIM-81: SELECT da conta A vê só as escalações do A', async () => {
    const { cenario, db } = aberto;
    const grupos = await comoApp(db, { conta: cenario.contaA }, async (d) => {
      const r = await d.query<{ grupo_id: string }>('SELECT grupo_id FROM escalacoes');
      return r.rows.map((l) => l.grupo_id);
    });
    expect(grupos).toEqual([cenario.grupoA]);
  });

  it('SIM-81: SELECT da conta A filtrando pelo grupo B devolve zero linhas', async () => {
    const { cenario, db } = aberto;
    const r = await comoApp(db, { conta: cenario.contaA }, (d) =>
      d.query('SELECT id FROM escalacoes WHERE grupo_id = $1', [cenario.grupoB]),
    );
    expect(r.rowCount).toBe(0);
  });

  it('SIM-81: SELECT sem contexto devolve zero linhas', async () => {
    const { db } = aberto;
    const r = await comoApp(db, {}, (d) => d.query('SELECT id FROM escalacoes'));
    expect(r.rowCount).toBe(0);
  });

  it('SIM-81: SELECT só com o slug público devolve zero linhas', async () => {
    const { cenario, db } = aberto;
    const r = await comoApp(db, { slug: cenario.slugA }, (d) =>
      d.query('SELECT id FROM escalacoes'),
    );
    expect(r.rowCount).toBe(0);
  });
});

describe('escalacoes: INSERT', () => {
  it('SIM-81: INSERT da conta A no grupo B é recusado pela policy', async () => {
    const { cenario, db } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) => inserir(d, cenario.grupoB, cenario.contaA)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('SIM-81: INSERT sem contexto é recusado', async () => {
    const { cenario, db } = aberto;
    await expect(
      comoApp(db, {}, (d) => inserir(d, cenario.grupoA, cenario.contaA)),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('SIM-81: INSERT só com o slug público é recusado (o slug nunca escreve)', async () => {
    const { cenario, db } = aberto;
    await expect(
      comoApp(db, { slug: cenario.slugA }, (d) => inserir(d, cenario.grupoA, cenario.contaA)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('SIM-81: INSERT da conta A no grupo A passa e o B fica igual', async () => {
    const { cenario, db } = aberto;
    await comoApp(db, { conta: cenario.contaA }, async (d) => {
      const antes = await fotografia(d, cenario.grupoB);
      await d.query('SET LOCAL ROLE pelada_app');
      const r = await inserir(d, cenario.grupoA, cenario.contaA);
      expect(r.rowCount).toBe(1);
      expect(await fotografia(d, cenario.grupoB)).toEqual(antes);
    });
  });
});

describe('escalacoes: confirmada_por é a conta da sessão (A-14)', () => {
  it('SIM-81: INSERT da conta A com confirmada_por da conta B é recusado', async () => {
    const { cenario, db } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) =>
        inserir(d, cenario.grupoA, cenario.contaB, '2026-02-14'),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('SIM-81: UPDATE da conta A que troca confirmada_por para a conta B é recusado', async () => {
    const { cenario, db } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) =>
        d.query('UPDATE escalacoes SET confirmada_por = $1 WHERE grupo_id = $2', [
          cenario.contaB,
          cenario.grupoA,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('SIM-81: o upsert da conta A (INSERT ... ON CONFLICT DO UPDATE) com a própria conta passa', async () => {
    const { cenario, db } = aberto;
    await comoApp(db, { conta: cenario.contaA }, async (d) => {
      await d.query('SET LOCAL ROLE pelada_app');
      const r = await d.query(
        `INSERT INTO escalacoes (grupo_id, data, formato, n, k, composicao, confirmada_por, confirmada_em)
         SELECT grupo_id, data, formato, n, k, composicao, $2, now() FROM escalacoes WHERE grupo_id = $1
         ON CONFLICT (grupo_id, data) DO UPDATE SET confirmada_por = EXCLUDED.confirmada_por`,
        [cenario.grupoA, cenario.contaA],
      );
      expect(r.rowCount).toBe(1);
    });
  });
});

describe('escalacoes: UPDATE', () => {
  it('SIM-81: UPDATE sem WHERE da conta A altera só a linha do A', async () => {
    const { cenario, db } = aberto;
    await comoApp(db, { conta: cenario.contaA }, async (d) => {
      const antes = await fotografia(d, cenario.grupoB);
      await d.query('SET LOCAL ROLE pelada_app');
      const r = await d.query('UPDATE escalacoes SET n = 6');
      expect(r.rowCount).toBe(1);
      const depoisA = await fotografia(d, cenario.grupoA);
      expect(depoisA.map((l) => l.n)).toEqual([6]);
      expect(await fotografia(d, cenario.grupoB)).toEqual(antes);
    });
  });

  it('SIM-81: UPDATE da conta A com WHERE no grupo B afeta zero linhas', async () => {
    const { cenario, db } = aberto;
    await comoApp(db, { conta: cenario.contaA }, async (d) => {
      const antes = await fotografia(d, cenario.grupoB);
      await d.query('SET LOCAL ROLE pelada_app');
      const r = await d.query('UPDATE escalacoes SET n = 6 WHERE grupo_id = $1', [cenario.grupoB]);
      expect(r.rowCount).toBe(0);
      expect(await fotografia(d, cenario.grupoB)).toEqual(antes);
    });
  });

  it('SIM-81: UPDATE que move a escalação do A para o grupo B é recusado pelo WITH CHECK', async () => {
    const { cenario, db } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) =>
        d.query('UPDATE escalacoes SET grupo_id = $1 WHERE grupo_id = $2', [
          cenario.grupoB,
          cenario.grupoA,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('SIM-81: UPDATE sem contexto afeta zero linhas', async () => {
    const { db } = aberto;
    const r = await comoApp(db, {}, (d) => d.query('UPDATE escalacoes SET n = 6'));
    expect(r.rowCount).toBe(0);
  });
});

describe('escalacoes: DELETE', () => {
  it('SIM-81: DELETE sem WHERE da conta A apaga só a linha do A', async () => {
    const { cenario, db } = aberto;
    await comoApp(db, { conta: cenario.contaA }, async (d) => {
      const antes = await fotografia(d, cenario.grupoB);
      await d.query('SET LOCAL ROLE pelada_app');
      const r = await d.query('DELETE FROM escalacoes');
      expect(r.rowCount).toBe(1);
      expect(await fotografia(d, cenario.grupoA)).toEqual([]);
      expect(await fotografia(d, cenario.grupoB)).toEqual(antes);
    });
  });

  it('SIM-81: DELETE da conta A com WHERE no grupo B apaga zero linhas', async () => {
    const { cenario, db } = aberto;
    await comoApp(db, { conta: cenario.contaA }, async (d) => {
      const antes = await fotografia(d, cenario.grupoB);
      await d.query('SET LOCAL ROLE pelada_app');
      const r = await d.query('DELETE FROM escalacoes WHERE grupo_id = $1', [cenario.grupoB]);
      expect(r.rowCount).toBe(0);
      expect(await fotografia(d, cenario.grupoB)).toEqual(antes);
    });
  });

  it('SIM-81: DELETE sem contexto apaga zero linhas', async () => {
    const { db } = aberto;
    const r = await comoApp(db, {}, (d) => d.query('DELETE FROM escalacoes'));
    expect(r.rowCount).toBe(0);
  });
});

describe('escalacoes: restrições', () => {
  it('SIM-69: segunda escalação na mesma data do grupo dá 23505 em escalacoes_grupo_data', async () => {
    const { cenario, db } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) =>
        inserir(d, cenario.grupoA, cenario.contaA, '2026-01-03'),
      ),
    ).rejects.toMatchObject({ code: '23505', constraint: 'escalacoes_grupo_data' });
  });

  it('SIM-72: varios_times com K dá 23514 em escalacoes_k_so_em_dois_times', async () => {
    const { cenario, db } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) =>
        d.query(
          `INSERT INTO escalacoes (grupo_id, data, formato, n, k, composicao, confirmada_por, confirmada_em)
           VALUES ($1, '2026-02-14', 'varios_times', 4, 2, '{"times": []}'::jsonb, $2, now())`,
          [cenario.grupoA, cenario.contaA],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'escalacoes_k_so_em_dois_times' });
  });

  it('SIM-72: varios_times sem K e dois_times com K nulo (ilimitado) são aceitos', async () => {
    const { cenario, db } = aberto;
    await comoApp(db, { conta: cenario.contaA }, async (d) => {
      const varios = await d.query(
        `INSERT INTO escalacoes (grupo_id, data, formato, n, k, composicao, confirmada_por, confirmada_em)
         VALUES ($1, '2026-02-14', 'varios_times', 4, NULL, '{"times": []}'::jsonb, $2, now())`,
        [cenario.grupoA, cenario.contaA],
      );
      const dois = await d.query(
        `INSERT INTO escalacoes (grupo_id, data, formato, n, k, composicao, confirmada_por, confirmada_em)
         VALUES ($1, '2026-02-21', 'dois_times', 7, NULL, '{"times": [], "naoEntra": []}'::jsonb, $2, now())`,
        [cenario.grupoA, cenario.contaA],
      );
      expect([varios.rowCount, dois.rowCount]).toEqual([1, 1]);
    });
  });
});
