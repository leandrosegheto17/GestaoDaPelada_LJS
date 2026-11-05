import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, type CenarioAberto } from '../isolamento/apoio.ts';

/**
 * Tabelas do plano (planos-e-cobranca T10; PLA-33, PLA-41, PLA-43; AD-088), pelo superusuário do cluster local, numa
 * transação desfeita ao fim de cada caso: o que as constraints garantem antes de qualquer função.
 * A matriz política × comando das duas tabelas é da T11 (`test/isolamento/planos.test.ts`).
 */

let aberto: CenarioAberto;

beforeAll(async () => {
  aberto = await abrirCenario();
});

afterAll(async () => {
  await aberto?.fechar();
});

async function desfeito<T>(fn: (d: pg.Client) => Promise<T>): Promise<T> {
  const { db } = aberto;
  await db.query('BEGIN');
  try {
    return await fn(db);
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
  }
}

const inserirAssinatura = (d: pg.Client, grupo: string, conta: string, sub: string, situacao: string) =>
  d.query(
    `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, criada_por, criada_em)
     VALUES ($1, 'cus_t10', $2, 990, $3, $4, now())`,
    [grupo, sub, situacao, conta],
  );

const inserirEvento = (d: pg.Client, id: string) =>
  d.query(
    `INSERT INTO eventos_asaas (id, evento, data_criacao, cobranca_id, assinatura_id, status, valor_centavos, recebido_em)
     VALUES ($1, 'PAYMENT_CONFIRMED', now(), 'pay_t10', 'sub_t10', 'CONFIRMED', 990, now())`,
    [id],
  );

describe('assinaturas: uma vigente por grupo', () => {
  it('PLA-33: a segunda assinatura aguardando_pagamento do mesmo grupo dá 23505', async () => {
    const { cenario } = aberto;
    await expect(
      desfeito(async (d) => {
        await inserirAssinatura(d, cenario.grupoA, cenario.contaA, 'sub_t10_1', 'aguardando_pagamento');
        await inserirAssinatura(d, cenario.grupoA, cenario.contaA, 'sub_t10_2', 'aguardando_pagamento');
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('PLA-33: aguardando_pagamento com uma ativa no mesmo grupo dá 23505', async () => {
    const { cenario } = aberto;
    await expect(
      desfeito(async (d) => {
        await d.query(
          `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, pago_ate,
             criada_por, criada_em)
           VALUES ($1, 'cus_t10', 'sub_t10_ativa', 990, 'ativa', '2026-12-05', $2, now())`,
          [cenario.grupoA, cenario.contaA],
        );
        await inserirAssinatura(d, cenario.grupoA, cenario.contaA, 'sub_t10_3', 'aguardando_pagamento');
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('PLA-33: depois de cancelada, uma nova aguardando_pagamento entra', async () => {
    const { cenario } = aberto;
    const linhas = await desfeito(async (d) => {
      await inserirAssinatura(d, cenario.grupoA, cenario.contaA, 'sub_t10_4', 'aguardando_pagamento');
      await d.query(`UPDATE assinaturas SET situacao = 'cancelada' WHERE asaas_assinatura_id = 'sub_t10_4'`);
      const r = await inserirAssinatura(d, cenario.grupoA, cenario.contaA, 'sub_t10_5', 'aguardando_pagamento');
      return r.rowCount;
    });
    expect(linhas).toBe(1);
  });

  it('PLA-33: grupos diferentes têm cada um a sua vigente', async () => {
    const { cenario } = aberto;
    const linhas = await desfeito(async (d) => {
      await inserirAssinatura(d, cenario.grupoA, cenario.contaA, 'sub_t10_6', 'aguardando_pagamento');
      const r = await inserirAssinatura(d, cenario.grupoB, cenario.contaB, 'sub_t10_7', 'aguardando_pagamento');
      return r.rowCount;
    });
    expect(linhas).toBe(1);
  });

  it('PLA-30: valor_centavos 0 é recusado', async () => {
    const { cenario } = aberto;
    await expect(
      desfeito((d) =>
        d.query(
          `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, criada_por, criada_em)
           VALUES ($1, 'cus_t10', 'sub_t10_zero', 0, 'aguardando_pagamento', $2, now())`,
          [cenario.grupoA, cenario.contaA],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('PLA-30: situação fora da lista é recusada', async () => {
    const { cenario } = aberto;
    await expect(
      desfeito((d) => inserirAssinatura(d, cenario.grupoA, cenario.contaA, 'sub_t10_x', 'inadimplente')),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('eventos_asaas', () => {
  it('PLA-43: o mesmo id de evento duas vezes dá 23505', async () => {
    await expect(
      desfeito(async (d) => {
        await inserirEvento(d, 'evt_t10');
        await inserirEvento(d, 'evt_t10');
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('PLA-41: eventos_asaas não tem coluna de e-mail, nome, CPF nem grupo', async () => {
    const r = await aberto.db.query<{ coluna: string }>(
      `SELECT column_name AS coluna FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'eventos_asaas' ORDER BY ordinal_position`,
    );
    const colunas = r.rows.map((l) => l.coluna);
    expect(colunas).toEqual([
      'id',
      'evento',
      'data_criacao',
      'cobranca_id',
      'assinatura_id',
      'status',
      'valor_centavos',
      'recebido_em',
      'efeito',
    ]);
    for (const proibida of colunas) expect(proibida).not.toMatch(/email|nome|cpf|documento|telefone|grupo/i);
  });

  it('PLA-41: assinaturas não tem coluna de CPF nem de cartão', async () => {
    const r = await aberto.db.query<{ coluna: string }>(
      `SELECT column_name AS coluna FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'assinaturas'`,
    );
    for (const { coluna } of r.rows) expect(coluna).not.toMatch(/cpf|cartao|card|documento|email/i);
  });
});
