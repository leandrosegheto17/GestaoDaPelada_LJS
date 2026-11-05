import type { MensagemAviso } from '@pelada/contrato/fila-avisos';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import {
  filaMemoria,
  type FilaAvisos,
  type FilaMemoria,
} from '../../src/infraestrutura/fila/avisos.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Gatilho dos avisos de cobrança no webhook do Asaas (notificacoes T22; NOT-38, NOT-39, NOT-47; AD-105), pela rota
 * real como `pelada_app`, com a fila em memória no binding `FILA_AVISOS`. O grupo H (de B) recebe em cada caso a
 * assinatura `sub_t22`, posta como superusuário no estado do caso (molde: `webhook-asaas-aplicar.test.ts`, T36 da
 * `planos-e-cobranca`). A tarefa do `aposCommit` roda no `waitUntil` do contexto falso, esperado antes de olhar a fila.
 * O `afterEach` apaga auditoria, eventos `evt_t22_…` e a assinatura; o `afterAll` devolve H ao estado original.
 *
 * Evidência da rede (registrar na T22 do tasks.md, pelo /executar): tirar o `c.var.aposCommit` da rota deixa vermelho
 * todo "enfileira"; trocar a condição do `repetido` deixa vermelho o NOT-39; tirar `fora_de_ordem` do
 * `MOTIVOS_SEM_AVISO` deixa vermelho o "obsoleto".
 */

const TOKEN = 'token-do-webhook-de-teste-t22-abcdef';
const SUB = 'sub_t22';
let aberto: CenarioGruposAberto;
let original: { s: string; t: string | null } | null = null;
let fila: FilaMemoria;

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
     VALUES ($1, 'cus_t22', $2, 990, $3, 'https://sandbox.asaas.com/i/pay_t22_1', $4, $5, $6, $7, now())`,
    [
      cenario.grupoH,
      SUB,
      assinatura,
      paga ? '2026-12-05' : null,
      paga ? 'pay_t22_1' : null,
      paga ? '2026-11-05 11:00:00-03' : null,
      cenario.contaB,
    ],
  );
}

async function enviarCru(cru: string, filaDoEnv: FilaAvisos = fila): Promise<Response> {
  const ctx = contextoFalso();
  const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica });
  const r = await app.request(
    '/api/webhooks/asaas',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'asaas-access-token': TOKEN },
      body: cru,
    },
    envAcesso(aberto.url, { ASAAS_WEBHOOK_TOKEN: TOKEN, FILA_AVISOS: filaDoEnv }),
    ctx,
  );
  await ctx.esperar();
  return r;
}

function enviar(corpo: unknown, filaDoEnv: FilaAvisos = fila): Promise<Response> {
  return enviarCru(JSON.stringify(corpo), filaDoEnv);
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
      id: p.id ?? 'pay_t22_1',
      subscription: p.subscription ?? SUB,
      value: p.value ?? 9.9,
      dueDate: p.dueDate ?? '2026-11-05',
      status: 'PENDING',
    },
    ...extra,
  };
}

function esperado(
  aviso: 'cobranca_gerada' | 'pagamento_confirmado' | 'pagamento_atrasado',
  extra: { idExterno?: string; vencimento?: string; valorCentavos?: number } = {},
): MensagemAviso {
  return {
    tipo: 'cobranca',
    idExterno: extra.idExterno ?? 'pay_t22_1',
    aviso,
    grupoId: aberto.cenario.grupoH,
    valorCentavos: extra.valorCentavos ?? 990,
    vencimento: extra.vencimento ?? '2026-11-05',
    tentativa: 1,
  };
}

async function estado() {
  const { db, cenario } = aberto;
  const g = await db.query<{ s: string }>(
    'SELECT situacao_comercial AS s FROM grupos WHERE id = $1',
    [cenario.grupoH],
  );
  const a = await db.query<{ situacao: string; pago_ate: string | null }>(
    `SELECT situacao, pago_ate::text AS pago_ate FROM assinaturas WHERE asaas_assinatura_id = $1`,
    [SUB],
  );
  return { grupo: g.rows[0]!.s, assinatura: a.rows[0] };
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
  fila = filaMemoria();
});

afterEach(async () => {
  const { db } = aberto;
  await db.query(
    `DELETE FROM auditoria WHERE entidade_id IN (SELECT id::text FROM assinaturas WHERE asaas_assinatura_id = $1)`,
    [SUB],
  );
  await db.query(`DELETE FROM eventos_asaas WHERE id LIKE 'evt\\_t22\\_%' ESCAPE '\\'`);
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

describe('aviso de cobrança no webhook (T22)', () => {
  it('NOT-38: PAYMENT_CREATED enfileira cobranca_gerada, sem dado pessoal', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const r = await enviar(
      pagamento(
        'evt_t22_criada',
        'PAYMENT_CREATED',
        '2026-11-05 12:00:00',
        {},
        { customer: { name: 'Bia Souza', email: 'bia@exemplo.test', cpfCnpj: '52998224725' } },
      ),
    );
    expect(r.status).toBe(200);
    expect(fila.enviadas).toEqual([{ corpo: esperado('cobranca_gerada') }]);
    const texto = JSON.stringify(fila.enviadas);
    for (const pessoal of ['Bia Souza', 'bia@exemplo.test', '52998224725', 'cus_t22']) {
      expect(texto).not.toContain(pessoal);
    }
  });

  it('NOT-38: PAYMENT_RECEIVED enfileira pagamento_confirmado', async () => {
    await preparar('trial', 'aguardando_pagamento');
    expect(
      (await enviar(pagamento('evt_t22_recebido', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00')))
        .status,
    ).toBe(200);
    expect(fila.enviadas).toEqual([{ corpo: esperado('pagamento_confirmado') }]);
  });

  it('NOT-38: PAYMENT_CONFIRMED enfileira pagamento_confirmado', async () => {
    await preparar('trial', 'aguardando_pagamento');
    expect(
      (await enviar(pagamento('evt_t22_confirmado', 'PAYMENT_CONFIRMED', '2026-11-05 12:00:00')))
        .status,
    ).toBe(200);
    expect(fila.enviadas).toEqual([{ corpo: esperado('pagamento_confirmado') }]);
  });

  it('NOT-38: PAYMENT_OVERDUE de assinatura ativa enfileira pagamento_atrasado', async () => {
    await preparar('ativo', 'ativa');
    const r = await enviar(
      pagamento('evt_t22_atraso', 'PAYMENT_OVERDUE', '2026-12-06 08:00:00', {
        id: 'pay_t22_2',
        dueDate: '2026-12-05',
      }),
    );
    expect(r.status).toBe(200);
    expect(fila.enviadas).toEqual([
      {
        corpo: esperado('pagamento_atrasado', { idExterno: 'pay_t22_2', vencimento: '2026-12-05' }),
      },
    ]);
  });

  it('AD-105: PAYMENT_RECEIVED depois de PAYMENT_CONFIRMED da mesma cobrança: duas mensagens com a mesma chave (o consumidor descarta a segunda)', async () => {
    await preparar('trial', 'aguardando_pagamento');
    await enviar(pagamento('evt_t22_par_confirmado', 'PAYMENT_CONFIRMED', '2026-11-05 12:00:00'));
    await enviar(pagamento('evt_t22_par_recebido', 'PAYMENT_RECEIVED', '2026-11-05 12:05:00'));
    expect(fila.enviadas).toEqual([
      { corpo: esperado('pagamento_confirmado') },
      { corpo: esperado('pagamento_confirmado') },
    ]);
  });

  it('NOT-39: o mesmo evento repetido (PLA-42) não enfileira de novo', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const corpo = pagamento('evt_t22_repetido', 'PAYMENT_CREATED', '2026-11-05 12:00:00');
    expect((await enviar(corpo)).status).toBe(200);
    expect((await enviar(corpo)).status).toBe(200);
    expect(fila.enviadas).toEqual([{ corpo: esperado('cobranca_gerada') }]);
  });

  it('NOT-39: PAYMENT_CREATED obsoleto (anterior ao último aplicado, PLA-48) não enfileira', async () => {
    await preparar('ativo', 'ativa');
    const r = await enviar(pagamento('evt_t22_obsoleto', 'PAYMENT_CREATED', '2026-11-01 08:00:00'));
    expect(r.status).toBe(200);
    expect(fila.enviadas).toEqual([]);
  });

  it('NOT-38: evento fora do mapa (PAYMENT_REFUNDED, PAYMENT_DELETED, SUBSCRIPTION_DELETED) não enfileira', async () => {
    await preparar('ativo', 'ativa');
    await enviar(pagamento('evt_t22_estorno', 'PAYMENT_REFUNDED', '2026-11-10 09:00:00'));
    await enviar(pagamento('evt_t22_apagado', 'PAYMENT_DELETED', '2026-11-10 09:01:00'));
    await enviar({
      id: 'evt_t22_assinatura_apagada',
      event: 'SUBSCRIPTION_DELETED',
      dateCreated: '2026-11-20 09:00:00',
      subscription: { id: SUB },
    });
    expect(fila.enviadas).toEqual([]);
  });

  it('NOT-38: cobrança de assinatura desconhecida (PLA-49) não enfileira', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const r = await enviar(
      pagamento('evt_t22_desconhecida', 'PAYMENT_CREATED', '2026-11-05 12:00:00', {
        subscription: 'sub_t22_que_nao_existe',
      }),
    );
    expect(r.status).toBe(200);
    expect(fila.enviadas).toEqual([]);
  });

  it('NOT-38: valor divergente (PLA-51) não avisa pagamento confirmado [LACUNA]', async () => {
    await preparar('trial', 'aguardando_pagamento');
    await enviar(
      pagamento('evt_t22_divergente', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00', { value: 5 }),
    );
    expect(fila.enviadas).toEqual([]);
  });

  it('NOT-47: grupo Free (assinatura cancelada, grupo cancelado) enfileira a cobrança gerada', async () => {
    await preparar('cancelado', 'cancelada');
    const r = await enviar(
      pagamento('evt_t22_free', 'PAYMENT_CREATED', '2026-11-06 08:00:00', { id: 'pay_t22_free' }),
    );
    expect(r.status).toBe(200);
    expect(fila.enviadas).toEqual([
      { corpo: esperado('cobranca_gerada', { idExterno: 'pay_t22_free' }) },
    ]);
  });

  it('NOT-40: valor 9.90 no corpo cru vira 990 centavos; fração de centavo não enfileira', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const cru = `{"id":"evt_t22_cru","event":"PAYMENT_CREATED","dateCreated":"2026-11-05 12:00:00",
      "payment":{"id":"pay_t22_1","subscription":"${SUB}","value":9.90,"dueDate":"2026-11-05"}}`;
    expect((await enviarCru(cru)).status).toBe(200);
    await enviar(
      pagamento('evt_t22_fracao', 'PAYMENT_CREATED', '2026-11-05 12:01:00', {
        id: 'pay_t22_fracao',
        value: 9.901,
      }),
    );
    expect(fila.enviadas).toEqual([{ corpo: esperado('cobranca_gerada') }]);
  });

  it('NOT-40: vencimento fora de AAAA-MM-DD não enfileira', async () => {
    await preparar('trial', 'aguardando_pagamento');
    await enviar(
      pagamento('evt_t22_sem_data', 'PAYMENT_CREATED', '2026-11-05 12:00:00', {
        dueDate: '05/11/2026',
      }),
    );
    expect(fila.enviadas).toEqual([]);
  });

  it('NOT-39: erro na transação (500) não enfileira; o Asaas reenvia e aí sai uma mensagem', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const { db, cenario } = aberto;
    await db.query(`CREATE FUNCTION teste_t22_falha() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha forçada do teste T22'; END $$`);
    const corpo = pagamento('evt_t22_falha', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00');
    try {
      await db.query(
        `CREATE TRIGGER teste_t22_falha BEFORE INSERT ON auditoria FOR EACH ROW
           WHEN (NEW.acao = 'plano_ativado' AND NEW.grupo_id = '${cenario.grupoH}'::uuid)
           EXECUTE FUNCTION teste_t22_falha()`,
      );
      expect((await enviar(corpo)).status).toBe(500);
      expect(fila.enviadas).toEqual([]);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS teste_t22_falha ON auditoria');
      await db.query('DROP FUNCTION IF EXISTS teste_t22_falha()');
    }
    expect((await enviar(corpo)).status).toBe(200);
    expect(fila.enviadas).toEqual([{ corpo: esperado('pagamento_confirmado') }]);
  });

  it('caracterização: com a fila que lança, a resposta e o estado do grupo são os mesmos', async () => {
    const quebrada: FilaAvisos = {
      send: async () => {
        throw new Error('fila fora do ar');
      },
    };
    await preparar('trial', 'aguardando_pagamento');
    const r = await enviar(
      pagamento('evt_t22_fila_quebrada', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00'),
      quebrada,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ recebido: true });
    expect(await estado()).toEqual({
      grupo: 'ativo',
      assinatura: { situacao: 'ativa', pago_ate: '2026-12-05' },
    });
  });
});
