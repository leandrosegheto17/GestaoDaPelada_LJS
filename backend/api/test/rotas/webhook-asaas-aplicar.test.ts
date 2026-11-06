import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RelatoValorDivergente } from '../../src/aplicacao/plano/webhook.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Webhook do Asaas: registrar e aplicar o evento (planos-e-cobranca T36; PLA-41, PLA-42, PLA-44 a PLA-47, PLA-49,
 * PLA-51), pela rota real como `pelada_app`. O grupo H (de B) começa cada caso em `trial` desde 2026-11-01, com a
 * assinatura `sub_t36` posta como superusuário no estado do caso. O `afterEach` apaga auditoria, eventos `evt_t36_…` e a
 * assinatura; o `afterAll` devolve H ao estado original.
 *
 * Evidência da rede (registrar na T36 do tasks.md, pelo /executar): trocar `plano_ativar` por `plano_inadimplente` no
 * `case 'ativar'` deixa vermelho o PLA-44; tirar o `reportar` do valor divergente deixa vermelho o PLA-51.
 */

const TOKEN = 'token-do-webhook-de-teste-t36-abcdef';
const SUB = 'sub_t36';
let aberto: CenarioGruposAberto;
let original: { s: string; t: string | null } | null = null;
let relatos: RelatoValorDivergente[] = [];

type SituacaoAssinatura = 'aguardando_pagamento' | 'ativa' | 'cancelada';
type SituacaoGrupo = 'trial' | 'ativo' | 'inadimplente' | 'cancelado';

async function preparar(grupo: SituacaoGrupo, assinatura: SituacaoAssinatura): Promise<void> {
  const { db, cenario } = aberto;
  await db.query('UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3 WHERE id = $1', [
    cenario.grupoH,
    grupo,
    grupo === 'trial' ? '2026-11-01' : null,
  ]);
  const paga = assinatura !== 'aguardando_pagamento';
  await db.query(
    `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, fatura_url,
       pago_ate, cobranca_pro_id, ultimo_evento_em, criada_por, criada_em)
     VALUES ($1, 'cus_t36', $2, 990, $3, 'https://sandbox.asaas.com/i/pay_t36_1', $4, $5, $6, $7, now())`,
    [
      cenario.grupoH,
      SUB,
      assinatura,
      paga ? '2026-12-05' : null,
      paga ? 'pay_t36_1' : null,
      paga ? '2026-11-05 11:00:00-03' : null,
      cenario.contaB,
    ],
  );
}

async function enviar(corpo: unknown): Promise<Response> {
  const ctx = contextoFalso();
  const app = criarApp({
    fabricaBanco: fabricaComoApp().fabrica,
    reportarWebhook: (r) => relatos.push(r),
  });
  const r = await app.request(
    '/api/webhooks/asaas',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'asaas-access-token': TOKEN },
      body: JSON.stringify(corpo),
    },
    envAcesso(aberto.url, { ASAAS_WEBHOOK_TOKEN: TOKEN }),
    ctx,
  );
  await ctx.esperar();
  return r;
}

function pagamento(
  id: string,
  evento: string,
  dataCriacao: string,
  p: { id?: string; value?: unknown; dueDate?: string; subscription?: string } = {},
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    event: evento,
    dateCreated: dataCriacao,
    payment: {
      id: p.id ?? 'pay_t36_1',
      subscription: p.subscription ?? SUB,
      value: p.value ?? 9.9,
      dueDate: p.dueDate ?? '2026-11-05',
      status: 'RECEIVED',
    },
    ...extra,
  };
}

async function estado() {
  const { db, cenario } = aberto;
  const g = await db.query<{ s: string; t: string | null }>(
    'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
    [cenario.grupoH],
  );
  const a = await db.query<{
    situacao: string;
    pago_ate: string | null;
    cobranca_pro_id: string | null;
  }>(
    `SELECT situacao, pago_ate::text AS pago_ate, cobranca_pro_id FROM assinaturas WHERE asaas_assinatura_id = $1`,
    [SUB],
  );
  return { grupo: g.rows[0]!.s, trialInicio: g.rows[0]!.t, assinatura: a.rows[0] };
}

async function auditorias(acao: string): Promise<number> {
  const r = await aberto.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM auditoria WHERE acao = $1
       AND entidade_id IN (SELECT id::text FROM assinaturas WHERE asaas_assinatura_id = $2)`,
    [acao, SUB],
  );
  return r.rows[0]!.n;
}

async function eventos(): Promise<Array<{ id: string; efeito: string | null }>> {
  const r = await aberto.db.query<{ id: string; efeito: string | null }>(
    `SELECT id, efeito FROM eventos_asaas WHERE id LIKE 'evt\\_t36\\_%' ESCAPE '\\' ORDER BY id`,
  );
  return r.rows;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ s: string; t: string | null }>(
    'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
    [aberto.cenario.grupoH],
  );
  original = r.rows[0]!;
});

beforeEach(() => {
  relatos = [];
});

afterEach(async () => {
  const { db } = aberto;
  await db.query(
    `DELETE FROM auditoria WHERE entidade_id IN (SELECT id::text FROM assinaturas WHERE asaas_assinatura_id = $1)`,
    [SUB],
  );
  await db.query(`DELETE FROM eventos_asaas WHERE id LIKE 'evt\\_t36\\_%' ESCAPE '\\'`);
  await db.query('DELETE FROM assinaturas WHERE asaas_assinatura_id = $1', [SUB]);
});

afterAll(async () => {
  if (aberto && original) {
    await aberto.db.query(
      'UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1',
      [aberto.cenario.grupoH, original.s, original.t],
    );
  }
  await aberto?.fechar();
});

describe('aplicar o evento (T36)', () => {
  it('PLA-44: PAYMENT_RECEIVED de assinatura pendente: grupo ativo, assinatura ativa e pagoAte = vencimento + 1 mês', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const r = await enviar(
      pagamento('evt_t36_recebido', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00'),
    );
    expect(r.status).toBe(200);
    expect(await estado()).toEqual({
      grupo: 'ativo',
      trialInicio: null,
      assinatura: { situacao: 'ativa', pago_ate: '2026-12-05', cobranca_pro_id: 'pay_t36_1' },
    });
    expect(await auditorias('plano_ativado')).toBe(1);
    expect(await eventos()).toEqual([{ id: 'evt_t36_recebido', efeito: 'ativar' }]);
  });

  it('PLA-44: PAYMENT_CONFIRMED também ativa', async () => {
    await preparar('trial', 'aguardando_pagamento');
    expect(
      (await enviar(pagamento('evt_t36_confirmado', 'PAYMENT_CONFIRMED', '2026-11-05 12:00:00')))
        .status,
    ).toBe(200);
    expect((await estado()).grupo).toBe('ativo');
  });

  it('PLA-45: PAYMENT_OVERDUE da cobrança mais recente de assinatura ativa: grupo inadimplente, assinatura segue ativa', async () => {
    await preparar('ativo', 'ativa');
    const r = await enviar(
      pagamento('evt_t36_atraso', 'PAYMENT_OVERDUE', '2026-12-06 08:00:00', {
        id: 'pay_t36_2',
        dueDate: '2026-12-05',
      }),
    );
    expect(r.status).toBe(200);
    expect(await estado()).toEqual({
      grupo: 'inadimplente',
      trialInicio: null,
      assinatura: { situacao: 'ativa', pago_ate: '2026-12-05', cobranca_pro_id: 'pay_t36_1' },
    });
    expect(await auditorias('plano_inadimplente')).toBe(1);
  });

  it('PLA-46: SUBSCRIPTION_DELETED de assinatura ativa: grupo cancelado, assinatura cancelada, pagoAte mantido', async () => {
    await preparar('ativo', 'ativa');
    const r = await enviar({
      id: 'evt_t36_apagada',
      event: 'SUBSCRIPTION_DELETED',
      dateCreated: '2026-11-20 09:00:00',
      subscription: { id: SUB },
    });
    expect(r.status).toBe(200);
    expect(await estado()).toEqual({
      grupo: 'cancelado',
      trialInicio: null,
      assinatura: { situacao: 'cancelada', pago_ate: '2026-12-05', cobranca_pro_id: 'pay_t36_1' },
    });
    expect(await auditorias('plano_cancelado')).toBe(1);
  });

  it('PLA-46: SUBSCRIPTION_INACTIVATED também cancela', async () => {
    await preparar('ativo', 'ativa');
    await enviar({
      id: 'evt_t36_inativada',
      event: 'SUBSCRIPTION_INACTIVATED',
      dateCreated: '2026-11-20 09:00:00',
      subscription: { id: SUB },
    });
    expect((await estado()).grupo).toBe('cancelado');
  });

  it('PLA-47: PAYMENT_REFUNDED da cobrança que deu o Pro: grupo inadimplente', async () => {
    await preparar('ativo', 'ativa');
    const r = await enviar(pagamento('evt_t36_estorno', 'PAYMENT_REFUNDED', '2026-11-10 09:00:00'));
    expect(r.status).toBe(200);
    expect((await estado()).grupo).toBe('inadimplente');
  });

  it('PLA-47: estorno de outra cobrança não muda o grupo', async () => {
    await preparar('ativo', 'ativa');
    await enviar(
      pagamento('evt_t36_estorno_outra', 'PAYMENT_REFUNDED', '2026-11-10 09:00:00', {
        id: 'pay_t36_outra',
      }),
    );
    expect((await estado()).grupo).toBe('ativo');
  });

  it('PLA-42: o mesmo evento duas vezes: 200 nas duas e uma auditoria só', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const corpo = pagamento('evt_t36_duas_vezes', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00');
    expect((await enviar(corpo)).status).toBe(200);
    expect((await enviar(corpo)).status).toBe(200);
    expect(await auditorias('plano_ativado')).toBe(1);
    expect(await eventos()).toEqual([{ id: 'evt_t36_duas_vezes', efeito: 'ativar' }]);
  });

  it('PLA-49: PAYMENT_DELETED responde 200 sem mudança e o evento fica gravado', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const antes = await estado();
    const r = await enviar(pagamento('evt_t36_apagado', 'PAYMENT_DELETED', '2026-11-05 12:00:00'));
    expect(r.status).toBe(200);
    expect(await estado()).toEqual(antes);
    expect(await eventos()).toEqual([{ id: 'evt_t36_apagado', efeito: null }]);
  });

  it('PLA-49: assinatura desconhecida responde 200 sem mudança e o evento fica gravado', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const antes = await estado();
    const r = await enviar(
      pagamento('evt_t36_desconhecida', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00', {
        subscription: 'sub_t36_que_nao_existe',
      }),
    );
    expect(r.status).toBe(200);
    expect(await estado()).toEqual(antes);
    expect(await eventos()).toEqual([{ id: 'evt_t36_desconhecida', efeito: null }]);
  });

  it('PLA-51: valor 5.00 contra 990 centavos: grava, não ativa e o Sentry recebe só o id e o tipo', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const r = await enviar(
      pagamento(
        'evt_t36_divergente',
        'PAYMENT_RECEIVED',
        '2026-11-05 12:00:00',
        { value: 5 },
        { customer: { name: 'Bia Souza', email: 'bia@exemplo.test', cpfCnpj: '52998224725' } },
      ),
    );
    expect(r.status).toBe(200);
    expect(await estado()).toMatchObject({
      grupo: 'trial',
      assinatura: { situacao: 'aguardando_pagamento' },
    });
    expect(await eventos()).toEqual([{ id: 'evt_t36_divergente', efeito: null }]);
    expect(relatos).toEqual([
      { motivo: 'valor_divergente', eventoId: 'evt_t36_divergente', evento: 'PAYMENT_RECEIVED' },
    ]);
    const texto = JSON.stringify(relatos);
    for (const pessoal of ['Bia Souza', 'bia@exemplo.test', '52998224725']) {
      expect(texto).not.toContain(pessoal);
    }
  });

  it('PLA-44: erro na transição responde 500 e nada fica gravado, nem o evento (o Asaas reenvia)', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const { db, cenario } = aberto;
    // Gatilho de falha: a auditoria do plano_ativado deste grupo é recusada (o grupo vem como literal no WHEN).
    await db.query(`CREATE FUNCTION teste_t36_falha() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha forçada do teste T36'; END $$`);
    try {
      await db.query(
        `CREATE TRIGGER teste_t36_falha BEFORE INSERT ON auditoria FOR EACH ROW
           WHEN (NEW.acao = 'plano_ativado' AND NEW.grupo_id = '${cenario.grupoH}'::uuid)
           EXECUTE FUNCTION teste_t36_falha()`,
      );
      const r = await enviar(pagamento('evt_t36_falha', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00'));
      expect(r.status).toBe(500);
      expect(await estado()).toMatchObject({
        grupo: 'trial',
        assinatura: { situacao: 'aguardando_pagamento', pago_ate: null },
      });
      expect(await eventos()).toEqual([]);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS teste_t36_falha ON auditoria');
      await db.query('DROP FUNCTION IF EXISTS teste_t36_falha()');
    }
  });
});
