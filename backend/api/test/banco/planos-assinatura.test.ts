import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `assinatura_registrar` e `assinatura_cancelar` (planos-e-cobranca T14; PLA-13, PLA-14, PLA-30, PLA-55; AD-115).
 * Atores: C = criadora de G (G nasce em trial pela `grupo_criar` desde a T13), O = admin convidada de G, B = conta só
 * de H. Cada caso é uma transação desfeita: preparação como superusuário, a chamada como `pelada_app` com o contexto
 * e a conferência de novo como superusuário.
 *
 * Evidência da rede (registrar na T14 do tasks.md, pelo /executar): tirar a conferência de `criado_por` deixa
 * vermelho "O recebe 42501"; tirar o UPDATE do grupo no cancelamento da ativa deixa vermelho o PLA-55.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Transação desfeita: `preparar` como superusuário, `fn` como pelada_app com a conta, `conferir` como superusuário. */
async function caso<T, R>(
  conta: string | null,
  preparar: (d: pg.Client) => Promise<void>,
  fn: (d: pg.Client) => Promise<T>,
  conferir: (d: pg.Client, resultado: T) => Promise<R>,
): Promise<R> {
  const { db } = aberto;
  await db.query('BEGIN');
  try {
    await preparar(db);
    await db.query('SET LOCAL ROLE pelada_app');
    await db.query(`SELECT set_config('app.conta_id', $1, true), set_config('app.slug_publico', '', true)`, [conta ?? '']);
    const resultado = await fn(db);
    await db.query('RESET ROLE');
    return await conferir(db, resultado);
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
  }
}

const nada = async () => undefined;

const registrar = (d: pg.Client, grupo: string, sub = 'sub_t14') =>
  d.query<{ id: string }>(
    `SELECT assinatura_registrar($1, 'cus_t14', $2, 990, 'https://sandbox.asaas.com/i/t14') AS id`,
    [grupo, sub],
  );

const cancelar = (d: pg.Client, grupo: string) =>
  d.query<{ antes: string }>('SELECT assinatura_cancelar($1) AS antes', [grupo]);

async function grupoComoEsta(d: pg.Client, grupo: string) {
  const r = await d.query('SELECT situacao_comercial, trial_inicio::text FROM grupos WHERE id = $1', [grupo]);
  return r.rows[0];
}

/** G passa a `ativo` com uma assinatura `ativa` paga até 2026-12-05 (o que o webhook faria). */
async function gAtivo(d: pg.Client): Promise<void> {
  const { cenario } = aberto;
  await d.query(`UPDATE grupos SET situacao_comercial = 'ativo', trial_inicio = NULL WHERE id = $1`, [cenario.grupoG]);
  await d.query(
    `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, pago_ate,
       cobranca_pro_id, criada_por, criada_em)
     VALUES ($1, 'cus_t14', 'sub_t14_ativa', 990, 'ativa', '2026-12-05', 'pay_t14', $2, now())`,
    [cenario.grupoG, cenario.contaC],
  );
}

describe('assinatura_registrar', () => {
  it('PLA-30: a criadora registra; a linha fica aguardando_pagamento com o valor em centavos e o grupo não muda', async () => {
    const { cenario } = aberto;
    const r = await caso(
      cenario.contaC,
      nada,
      async (d) => (await registrar(d, cenario.grupoG)).rows[0]?.id,
      async (d, id) => {
        const a = await d.query(
          `SELECT situacao, valor_centavos, asaas_cliente_id, asaas_assinatura_id, fatura_url, criada_por, pago_ate
             FROM assinaturas WHERE id = $1`,
          [id],
        );
        return { assinatura: a.rows[0], grupo: await grupoComoEsta(d, cenario.grupoG) };
      },
    );
    expect(r.assinatura).toEqual({
      situacao: 'aguardando_pagamento',
      valor_centavos: 990,
      asaas_cliente_id: 'cus_t14',
      asaas_assinatura_id: 'sub_t14',
      fatura_url: 'https://sandbox.asaas.com/i/t14',
      criada_por: cenario.contaC,
      pago_ate: null,
    });
    expect(r.grupo).toMatchObject({ situacao_comercial: 'trial' });
  });

  it('PLA-14: registrar audita plano_assinado com antes e depois iguais', async () => {
    const { cenario } = aberto;
    const linhas = await caso(
      cenario.contaC,
      nada,
      async (d) => (await registrar(d, cenario.grupoG)).rows[0]?.id,
      async (d, id) =>
        (
          await d.query(
            `SELECT autor_tipo, autor_conta_id, entidade, entidade_id, resumo FROM auditoria
              WHERE acao = 'plano_assinado' AND grupo_id = $1`,
            [cenario.grupoG],
          )
        ).rows.map((l) => ({ ...l, mesmoId: l.entidade_id === id })),
    );
    expect(linhas).toEqual([
      {
        autor_tipo: 'conta',
        autor_conta_id: cenario.contaC,
        entidade: 'assinatura',
        entidade_id: expect.any(String),
        resumo: { antes: 'trial', depois: 'trial' },
        mesmoId: true,
      },
    ]);
  });

  it.each([
    ['O, a convidada', 'O'],
    ['B, de outro grupo', 'B'],
    ['sem contexto', 'N'],
  ] as const)('PLA-13: %s recebe 42501 e nada é gravado', async (_nome, ator) => {
    const { cenario } = aberto;
    const conta = ator === 'O' ? cenario.contaO : ator === 'B' ? cenario.contaB : null;
    const { db } = aberto;
    const antes = await db.query('SELECT count(*)::int AS n FROM assinaturas');
    await expect(caso(conta, nada, (d) => registrar(d, cenario.grupoG), nada)).rejects.toMatchObject({ code: '42501' });
    expect((await db.query('SELECT count(*)::int AS n FROM assinaturas')).rows).toEqual(antes.rows);
  });

  it('PLA-30: grupo arquivado recusa com 55000', async () => {
    const { cenario } = aberto;
    await expect(
      caso(
        cenario.contaC,
        (d) => d.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoG]).then(() => undefined),
        (d) => registrar(d, cenario.grupoG),
        nada,
      ),
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('PLA-33: com uma pendente no grupo, o segundo registro dá 23505', async () => {
    const { cenario } = aberto;
    await expect(
      caso(
        cenario.contaC,
        nada,
        async (d) => {
          await registrar(d, cenario.grupoG, 'sub_t14_a');
          await registrar(d, cenario.grupoG, 'sub_t14_b');
        },
        nada,
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

describe('assinatura_cancelar', () => {
  it('PLA-55: cancelar a ativa deixa o grupo cancelado com o mesmo pago_ate', async () => {
    const { cenario } = aberto;
    const r = await caso(
      cenario.contaC,
      gAtivo,
      async (d) => (await cancelar(d, cenario.grupoG)).rows[0]?.antes,
      async (d, antes) => {
        const a = await d.query(`SELECT situacao, pago_ate::text FROM assinaturas WHERE asaas_assinatura_id = 'sub_t14_ativa'`);
        return { antes, assinatura: a.rows[0], grupo: await grupoComoEsta(d, cenario.grupoG) };
      },
    );
    expect(r).toEqual({
      antes: 'ativa',
      assinatura: { situacao: 'cancelada', pago_ate: '2026-12-05' },
      grupo: { situacao_comercial: 'cancelado', trial_inicio: null },
    });
  });

  it('PLA-55: cancelar a ativa audita plano_cancelado com antes ativo e depois cancelado', async () => {
    const { cenario } = aberto;
    const linhas = await caso(
      cenario.contaC,
      gAtivo,
      (d) => cancelar(d, cenario.grupoG),
      async (d) =>
        (
          await d.query(
            `SELECT autor_tipo, autor_conta_id, resumo FROM auditoria WHERE acao = 'plano_cancelado' AND grupo_id = $1`,
            [cenario.grupoG],
          )
        ).rows,
    );
    expect(linhas).toEqual([
      {
        autor_tipo: 'conta',
        autor_conta_id: cenario.contaC,
        resumo: { antes: 'ativo', depois: 'cancelado', assinatura: 'ativa' },
      },
    ]);
  });

  it('PLA-55: cancelar a pendente marca cancelada e o grupo segue trial (AD-115)', async () => {
    const { cenario } = aberto;
    const r = await caso(
      cenario.contaC,
      nada,
      async (d) => {
        await registrar(d, cenario.grupoG);
        return (await cancelar(d, cenario.grupoG)).rows[0]?.antes;
      },
      async (d, antes) => {
        const a = await d.query(`SELECT situacao FROM assinaturas WHERE asaas_assinatura_id = 'sub_t14'`);
        return { antes, assinatura: a.rows[0], grupo: await grupoComoEsta(d, cenario.grupoG) };
      },
    );
    expect(r.antes).toBe('aguardando_pagamento');
    expect(r.assinatura).toEqual({ situacao: 'cancelada' });
    expect(r.grupo).toMatchObject({ situacao_comercial: 'trial' });
  });

  it('PLA-55: sem assinatura vigente, cancelar dá P0002', async () => {
    const { cenario } = aberto;
    await expect(caso(cenario.contaC, nada, (d) => cancelar(d, cenario.grupoG), nada)).rejects.toMatchObject({
      code: 'P0002',
    });
  });

  it('PLA-55: cancelar duas vezes: a segunda dá P0002', async () => {
    const { cenario } = aberto;
    await expect(
      caso(
        cenario.contaC,
        gAtivo,
        async (d) => {
          await cancelar(d, cenario.grupoG);
          await cancelar(d, cenario.grupoG);
        },
        nada,
      ),
    ).rejects.toMatchObject({ code: 'P0002' });
  });

  it.each([
    ['O, a convidada', 'O'],
    ['sem contexto', 'N'],
  ] as const)('PLA-13: %s não cancela (42501)', async (_nome, ator) => {
    const { cenario } = aberto;
    const conta = ator === 'O' ? cenario.contaO : null;
    await expect(caso(conta, gAtivo, (d) => cancelar(d, cenario.grupoG), nada)).rejects.toMatchObject({ code: '42501' });
  });
});
