import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Transições do plano pelo webhook (planos-e-cobranca T16; PLA-13, PLA-14, PLA-44, PLA-45, PLA-46, PLA-47; AD-096).
 * Cada caso é uma transação desfeita: preparação como superusuário (G em um estado, a assinatura `sub_t16` e o evento
 * `evt_t16`), a chamada como `pelada_app` com o contexto dado e a conferência como superusuário.
 *
 * Casos limite e estados: ativar G em `trial`, `inadimplente`, `cancelado` e `uso_proprio`; cancelar já cancelada;
 * assinatura desconhecida; com conta ou slug; falha forçada na auditoria.
 *
 * Evidência da rede (registrar na T16 do tasks.md, pelo /executar): tirar `trial_inicio = NULL` do UPDATE do plano_ativar
 * deixa vermelho o PLA-44 (23514 do CHECK grupos_trial); trocar `autor_tipo` por `conta` deixa vermelho o PLA-14.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

type SituacaoGrupo = 'trial' | 'ativo' | 'inadimplente' | 'cancelado' | 'uso_proprio';
type SituacaoAssinatura = 'aguardando_pagamento' | 'ativa' | 'cancelada';

interface Contexto {
  conta?: string;
  slug?: string;
}

async function caso<T, R>(
  grupo: SituacaoGrupo,
  assinatura: SituacaoAssinatura,
  contexto: Contexto,
  fn: (d: pg.Client) => Promise<T>,
  conferir: (d: pg.Client, r: T) => Promise<R>,
  antesDaChamada: (d: pg.Client) => Promise<void> = async () => undefined,
): Promise<R> {
  const { db, cenario } = aberto;
  await db.query('BEGIN');
  try {
    await db.query(`UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3 WHERE id = $1`, [
      cenario.grupoG,
      grupo,
      grupo === 'trial' ? '2026-11-01' : null,
    ]);
    await db.query(
      `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, pago_ate,
         cobranca_pro_id, criada_por, criada_em)
       VALUES ($1, 'cus_t16', 'sub_t16', 990, $2, $3, $4, $5, now())`,
      [
        cenario.grupoG,
        assinatura,
        assinatura === 'aguardando_pagamento' ? null : '2026-11-30',
        assinatura === 'aguardando_pagamento' ? null : 'pay_t16_antiga',
        cenario.contaC,
      ],
    );
    await db.query(
      `INSERT INTO eventos_asaas (id, evento, cobranca_id, assinatura_id, recebido_em)
       VALUES ('evt_t16', 'PAYMENT_CONFIRMED', 'pay_t16', 'sub_t16', now())`,
    );
    await antesDaChamada(db);
    await db.query('SET LOCAL ROLE pelada_app');
    await db.query(
      `SELECT set_config('app.conta_id', $1, true), set_config('app.slug_publico', $2, true)`,
      [contexto.conta ?? '', contexto.slug ?? ''],
    );
    const r = await fn(db);
    await db.query('RESET ROLE');
    return await conferir(db, r);
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
  }
}

const ativar = (d: pg.Client, sub = 'sub_t16') =>
  d.query<{ ok: boolean }>(
    `SELECT plano_ativar($1, '2026-12-30', 'pay_t16', '2026-11-05 10:00:00', 'evt_t16') AS ok`,
    [sub],
  );
const inadimplente = (d: pg.Client, sub = 'sub_t16') =>
  d.query<{ ok: boolean }>(
    `SELECT plano_inadimplente($1, '2026-11-05 10:00:00', 'evt_t16') AS ok`,
    [sub],
  );
const cancelado = (d: pg.Client, sub = 'sub_t16') =>
  d.query<{ ok: boolean }>(`SELECT plano_cancelado($1, '2026-11-05 10:00:00', 'evt_t16') AS ok`, [
    sub,
  ]);

async function estado(d: pg.Client) {
  const { cenario } = aberto;
  const g = await d.query(
    'SELECT situacao_comercial, trial_inicio::text FROM grupos WHERE id = $1',
    [cenario.grupoG],
  );
  const a = await d.query(
    `SELECT situacao, pago_ate::text, cobranca_pro_id,
            to_char(ultimo_evento_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS') AS ultimo
       FROM assinaturas WHERE asaas_assinatura_id = 'sub_t16'`,
  );
  const e = await d.query(`SELECT efeito FROM eventos_asaas WHERE id = 'evt_t16'`);
  return { grupo: g.rows[0], assinatura: a.rows[0], efeito: e.rows[0]?.efeito };
}

async function auditoriaDe(d: pg.Client, acao: string) {
  const r = await d.query(
    `SELECT autor_tipo, autor_conta_id, entidade, resumo FROM auditoria WHERE acao = $1 AND grupo_id = $2`,
    [acao, aberto.cenario.grupoG],
  );
  return r.rows;
}

describe('plano_ativar', () => {
  it('PLA-44: grupo em trial vira ativo com trial_inicio nulo, assinatura ativa e pago_ate gravado', async () => {
    const r = await caso('trial', 'aguardando_pagamento', {}, ativar, async (d, res) => ({
      ok: res.rows[0]?.ok,
      ...(await estado(d)),
    }));
    expect(r).toEqual({
      ok: true,
      grupo: { situacao_comercial: 'ativo', trial_inicio: null },
      assinatura: {
        situacao: 'ativa',
        pago_ate: '2026-12-30',
        cobranca_pro_id: 'pay_t16',
        ultimo: '2026-11-05 10:00:00',
      },
      efeito: 'ativar',
    });
  });

  it.each(['inadimplente', 'cancelado'] as const)(
    'PLA-44: grupo %s com assinatura ativa volta a ativo',
    async (g) => {
      const r = await caso(g, 'ativa', {}, ativar, async (d) => (await estado(d)).grupo);
      expect(r).toEqual({ situacao_comercial: 'ativo', trial_inicio: null });
    },
  );

  it('PLA-44: falha forçada na auditoria desfaz grupo, assinatura e efeito', async () => {
    const r = await caso(
      'trial',
      'aguardando_pagamento',
      {},
      async (d) => {
        await d.query('SAVEPOINT antes');
        await expect(ativar(d)).rejects.toMatchObject({ code: 'P0001' });
        await d.query('ROLLBACK TO SAVEPOINT antes');
      },
      async (d) => estado(d),
      async (d) => {
        await d.query(`CREATE FUNCTION pg_temp.falha_t16() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'falha forçada na auditoria'; END $$`);
        await d.query(`CREATE TRIGGER falha_t16 BEFORE INSERT ON auditoria FOR EACH ROW
          WHEN (NEW.acao = 'plano_ativado') EXECUTE FUNCTION pg_temp.falha_t16()`);
      },
    );
    expect(r).toEqual({
      grupo: { situacao_comercial: 'trial', trial_inicio: '2026-11-01' },
      assinatura: {
        situacao: 'aguardando_pagamento',
        pago_ate: null,
        cobranca_pro_id: null,
        ultimo: null,
      },
      efeito: null,
    });
  });

  it('PLA-14: ativar audita plano_ativado com infraestrutura, sem conta, e antes e depois', async () => {
    const linhas = await caso('trial', 'aguardando_pagamento', {}, ativar, (d) =>
      auditoriaDe(d, 'plano_ativado'),
    );
    expect(linhas).toEqual([
      {
        autor_tipo: 'infraestrutura',
        autor_conta_id: null,
        entidade: 'assinatura',
        resumo: { antes: 'trial', depois: 'ativo', pago_ate: '2026-12-30' },
      },
    ]);
  });

  it('PLA-44: assinatura desconhecida devolve false e nada muda', async () => {
    const r = await caso(
      'trial',
      'aguardando_pagamento',
      {},
      (d) => ativar(d, 'sub_nao_existe'),
      async (d, res) => ({
        ok: res.rows[0]?.ok,
        ...(await estado(d)),
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.grupo).toEqual({ situacao_comercial: 'trial', trial_inicio: '2026-11-01' });
    expect(r.efeito).toBeNull();
  });

  it('PLA-44: assinatura cancelada não é reativada (false)', async () => {
    const r = await caso('cancelado', 'cancelada', {}, ativar, async (d, res) => ({
      ok: res.rows[0]?.ok,
      ...(await estado(d)),
    }));
    expect(r.ok).toBe(false);
    expect(r.grupo).toEqual({ situacao_comercial: 'cancelado', trial_inicio: null });
  });

  it('PLA-02: grupo de cortesia que assina continua uso_proprio', async () => {
    const r = await caso('uso_proprio', 'aguardando_pagamento', {}, ativar, async (d) => estado(d));
    expect(r.grupo).toEqual({ situacao_comercial: 'uso_proprio', trial_inicio: null });
    expect(r.assinatura).toMatchObject({ situacao: 'ativa' });
  });
});

describe('plano_inadimplente', () => {
  it('PLA-45: muda só o grupo; a assinatura segue ativa com o mesmo pago_ate', async () => {
    const r = await caso('ativo', 'ativa', {}, inadimplente, async (d) => estado(d));
    expect(r).toEqual({
      grupo: { situacao_comercial: 'inadimplente', trial_inicio: null },
      assinatura: {
        situacao: 'ativa',
        pago_ate: '2026-11-30',
        cobranca_pro_id: 'pay_t16_antiga',
        ultimo: '2026-11-05 10:00:00',
      },
      efeito: 'inadimplente',
    });
  });

  it('PLA-47: estorno (a mesma função) não mexe na cobrança que deu o Pro', async () => {
    const r = await caso(
      'ativo',
      'ativa',
      {},
      inadimplente,
      async (d) => (await estado(d)).assinatura,
    );
    expect(r).toMatchObject({ situacao: 'ativa', cobranca_pro_id: 'pay_t16_antiga' });
  });

  it('PLA-14: audita plano_inadimplente com infraestrutura e antes e depois', async () => {
    const linhas = await caso('ativo', 'ativa', {}, inadimplente, (d) =>
      auditoriaDe(d, 'plano_inadimplente'),
    );
    expect(linhas).toEqual([
      {
        autor_tipo: 'infraestrutura',
        autor_conta_id: null,
        entidade: 'assinatura',
        resumo: { antes: 'ativo', depois: 'inadimplente' },
      },
    ]);
  });
});

describe('plano_cancelado', () => {
  it('PLA-46: assinatura ativa: cancelada, grupo cancelado e pago_ate mantido', async () => {
    const r = await caso('ativo', 'ativa', {}, cancelado, async (d) => estado(d));
    expect(r).toEqual({
      grupo: { situacao_comercial: 'cancelado', trial_inicio: null },
      assinatura: {
        situacao: 'cancelada',
        pago_ate: '2026-11-30',
        cobranca_pro_id: 'pay_t16_antiga',
        ultimo: '2026-11-05 10:00:00',
      },
      efeito: 'cancelar',
    });
  });

  it('PLA-46: assinatura pendente: cancelada e o grupo segue trial', async () => {
    const r = await caso('trial', 'aguardando_pagamento', {}, cancelado, async (d) => estado(d));
    expect(r.grupo).toEqual({ situacao_comercial: 'trial', trial_inicio: '2026-11-01' });
    expect(r.assinatura).toMatchObject({ situacao: 'cancelada' });
  });

  it('PLA-46: já cancelada: false e nada muda', async () => {
    const r = await caso('cancelado', 'cancelada', {}, cancelado, async (d, res) => ({
      ok: res.rows[0]?.ok,
      ...(await estado(d)),
    }));
    expect(r.ok).toBe(false);
    expect(r.efeito).toBeNull();
  });

  it('PLA-14: audita plano_cancelado com infraestrutura e antes e depois', async () => {
    const linhas = await caso('ativo', 'ativa', {}, cancelado, (d) =>
      auditoriaDe(d, 'plano_cancelado'),
    );
    expect(linhas).toEqual([
      {
        autor_tipo: 'infraestrutura',
        autor_conta_id: null,
        entidade: 'assinatura',
        resumo: { antes: 'ativo', depois: 'cancelado', assinatura: 'ativa' },
      },
    ]);
  });
});

describe('PLA-13: as transições só sem conta e sem slug', () => {
  const chamadas = [
    ['plano_ativar', ativar],
    ['plano_inadimplente', inadimplente],
    ['plano_cancelado', cancelado],
    [
      'asaas_evento_sem_efeito',
      (d: pg.Client) => d.query(`SELECT asaas_evento_sem_efeito('evt_t16', 'nao_tratado')`),
    ],
  ] as const;

  it.each(chamadas)('PLA-13: %s com conta no contexto dá 42501', async (_nome, fn) => {
    await expect(
      caso('ativo', 'ativa', { conta: aberto.cenario.contaC }, fn, async () => undefined),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });

  it.each(chamadas)('PLA-13: %s com slug no contexto dá 42501', async (_nome, fn) => {
    await expect(
      caso('ativo', 'ativa', { slug: aberto.cenario.slugG }, fn, async () => undefined),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('asaas_evento_sem_efeito', () => {
  it('PLA-49: marca o motivo no evento, sem auditoria nem mudança no plano', async () => {
    const r = await caso(
      'ativo',
      'ativa',
      {},
      (d) => d.query(`SELECT asaas_evento_sem_efeito('evt_t16', 'nao_tratado')`),
      async (d) => ({
        ...(await estado(d)),
        auditoria: (
          await d.query(
            `SELECT 1 FROM auditoria WHERE grupo_id = $1 AND autor_tipo = 'infraestrutura'`,
            [aberto.cenario.grupoG],
          )
        ).rowCount,
      }),
    );
    expect(r.efeito).toBe('nenhum:nao_tratado');
    expect(r.grupo).toEqual({ situacao_comercial: 'ativo', trial_inicio: null });
    expect(r.auditoria).toBe(0);
  });
});
