import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { planoResposta } from '@pelada/contrato';
import { aplicarEventoAsaas } from '../../src/aplicacao/plano/webhook.ts';
import type { LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from '../repositorios/apoio.ts';

/**
 * Webhook do Asaas: concorrência, reenvio e fora de ordem (planos-e-cobranca T37; PLA-43, PLA-48, PLA-72, PLA-73,
 * PLA-74). Duas transações reais como `pelada_app` sem contexto (`comDb` com conta nula, o mesmo contexto da rota) para
 * o paralelo, como em `concorrencia/limite-jogadores.test.ts`; a rota real para as sequências. O grupo H (de B) começa
 * cada caso em `trial` desde 2026-11-01, com a assinatura `sub_t37` posta como superusuário.
 *
 * Casos limite (Domínio: sim), listados antes do teste: o mesmo id em paralelo (o segundo espera o primeiro na chave
 * única e sai `repetido`); dois eventos diferentes da mesma assinatura em paralelo (o segundo espera o `FOR UPDATE` da
 * assinatura e decide sobre o estado já gravado); 429 e reenvio; pagamento depois do fim do trial; lote atrasado e
 * fora de ordem depois de a fila ficar pausada.
 *
 * Evidência da rede (registrar na T37 do tasks.md, pelo /executar): tirar o `FOR UPDATE` do `asaas_evento_registrar`
 * deixa vermelho "dois eventos diferentes em paralelo" (o segundo decide sobre o estado antigo); trocar o `<` do
 * `fora_de_ordem` do domínio por `>` deixa vermelho o PLA-48 e o PLA-72.
 */

const TOKEN = 'token-do-webhook-de-teste-t37-abcdef';
const SUB = 'sub_t37';
const PRAZO_MS = 5000;
const SEGURAR_MS = 250;
let aberto: CenarioGruposAberto;
let original: { s: string; t: string | null } | null = null;

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

function sinal(): { promessa: Promise<void>; disparar: () => void } {
  let disparar: () => void = () => undefined;
  const promessa = new Promise<void>((ok) => {
    disparar = ok;
  });
  return { promessa, disparar };
}

/** Espera alguma conexão parada num lock de linha ou de chave dentro da função do webhook. */
async function esperarNaTrava(): Promise<void> {
  const limite = Date.now() + PRAZO_MS;
  while (Date.now() < limite) {
    const r = await aberto.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND query LIKE '%asaas_evento_registrar%'`,
    );
    if ((r.rows[0]?.n ?? 0) > 0) return;
    await esperar(20);
  }
  throw new Error('a segunda transação não parou na trava');
}

async function preparar(
  grupo: 'trial' | 'ativo',
  assinatura: 'aguardando_pagamento' | 'ativa',
  trialInicio = '2026-11-01',
): Promise<void> {
  const { db, cenario } = aberto;
  await db.query('UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3 WHERE id = $1', [
    cenario.grupoH,
    grupo,
    grupo === 'trial' ? trialInicio : null,
  ]);
  const paga = assinatura === 'ativa';
  await db.query(
    `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, pago_ate,
       cobranca_pro_id, ultimo_evento_em, criada_por, criada_em)
     VALUES ($1, 'cus_t37', $2, 990, $3, $4, $5, $6, $7, now())`,
    [
      cenario.grupoH,
      SUB,
      assinatura,
      paga ? '2026-12-05' : null,
      paga ? 'pay_t37_1' : null,
      paga ? '2026-11-05 11:00:00-03' : null,
      cenario.contaB,
    ],
  );
}

function evento(
  id: string,
  tipo: string,
  dataCriacao: string,
  pagamento: { id: string; dueDate?: string; value?: number } | null = { id: 'pay_t37_1' },
) {
  return {
    id,
    event: tipo,
    dateCreated: dataCriacao,
    ...(pagamento === null
      ? { subscription: { id: SUB } }
      : {
          payment: {
            id: pagamento.id,
            subscription: SUB,
            value: pagamento.value ?? 9.9,
            dueDate: pagamento.dueDate ?? '2026-11-05',
          },
        }),
  };
}

const permite: LimiteDeTaxa = { limit: async () => ({ success: true }) };
const nega: LimiteDeTaxa = { limit: async () => ({ success: false }) };

async function enviar(corpo: unknown, limite: LimiteDeTaxa = permite): Promise<Response> {
  const ctx = contextoFalso();
  const r = await criarApp({ fabricaBanco: fabricaComoApp().fabrica }).request(
    '/api/webhooks/asaas',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'asaas-access-token': TOKEN },
      body: JSON.stringify(corpo),
    },
    envAcesso(aberto.url, { ASAAS_WEBHOOK_TOKEN: TOKEN, LIMITE_WEBHOOK: limite }),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

/** `GET …/plano` de H pela criadora, com o relógio no instante dado. */
async function planoEm(agora: string) {
  const { cenario } = aberto;
  const ctx = contextoFalso();
  const r = await criarApp({
    fabricaBanco: fabricaComoApp().fabrica,
    relogio: relogioFixo(agora),
  }).request(
    `/api/grupos/${cenario.grupoH}/plano`,
    {
      method: 'GET',
      headers: { cookie: `${NOME_COOKIE_SESSAO}=${await sessao(cenario.contaB)}` },
    },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  expect(r.status).toBe(200);
  return planoResposta.parse(await r.json());
}

async function estado() {
  const { db, cenario } = aberto;
  const g = await db.query<{ s: string }>('SELECT situacao_comercial AS s FROM grupos WHERE id = $1', [
    cenario.grupoH,
  ]);
  const a = await db.query<{ situacao: string; pago_ate: string | null; cobranca_pro_id: string | null }>(
    `SELECT situacao, pago_ate::text AS pago_ate, cobranca_pro_id FROM assinaturas WHERE asaas_assinatura_id = $1`,
    [SUB],
  );
  return { grupo: g.rows[0]!.s, assinatura: a.rows[0] };
}

async function auditorias(acao: string): Promise<number> {
  const r = await aberto.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM auditoria WHERE acao = $1
       AND entidade_id IN (SELECT id::text FROM assinaturas WHERE asaas_assinatura_id = $2)`,
    [acao, SUB],
  );
  return r.rows[0]!.n;
}

/** Linhas do grupo nas tabelas do elenco e das partidas, para provar que nada se perdeu. */
async function linhasDoGrupo(): Promise<Record<string, number>> {
  const { db, cenario } = aberto;
  const contagem: Record<string, number> = {};
  for (const tabela of ['jogadores', 'periodos_ativos', 'partidas']) {
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${tabela} WHERE grupo_id = $1`,
      [cenario.grupoH],
    );
    contagem[tabela] = r.rows[0]!.n;
  }
  return contagem;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ s: string; t: string | null }>(
    'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
    [aberto.cenario.grupoH],
  );
  original = r.rows[0]!;
});

beforeEach(async () => {
  await aberto.db.query('DELETE FROM assinaturas WHERE asaas_assinatura_id = $1', [SUB]);
});

afterEach(async () => {
  const { db } = aberto;
  await db.query(
    `DELETE FROM auditoria WHERE entidade_id IN (SELECT id::text FROM assinaturas WHERE asaas_assinatura_id = $1)`,
    [SUB],
  );
  await db.query(`DELETE FROM eventos_asaas WHERE id LIKE 'evt\\_t37\\_%' ESCAPE '\\'`);
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

describe('webhook em paralelo', () => {
  it('PLA-43: 2 envios simultâneos do mesmo evento: uma auditoria plano_ativado e o segundo sai repetido', async () => {
    const { url } = aberto;
    await preparar('trial', 'aguardando_pagamento');
    const corpo = evento('evt_t37_paralelo', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00');
    const primeiroGravou = sinal();
    const soltar = sinal();

    const primeiro = comDb(
      url,
      null,
      async (db) => {
        const r = await aplicarEventoAsaas(db, corpo);
        primeiroGravou.disparar();
        await soltar.promessa;
        return r.resultado;
      },
      { confirmar: true },
    );
    await primeiroGravou.promessa;
    const segundo = comDb(url, null, async (db) => (await aplicarEventoAsaas(db, corpo)).resultado, {
      confirmar: true,
    });

    await esperarNaTrava();
    await esperar(SEGURAR_MS);
    soltar.disparar();

    expect(await primeiro).toBe('aplicado');
    expect(await segundo).toBe('repetido');
    expect(await auditorias('plano_ativado')).toBe(1);
    expect((await estado()).grupo).toBe('ativo');
  });

  it('PLA-48: dois eventos diferentes da mesma assinatura em paralelo: o segundo decide sobre o estado já gravado', async () => {
    const { url } = aberto;
    await preparar('trial', 'aguardando_pagamento');
    const primeiroGravou = sinal();
    const soltar = sinal();

    const primeiro = comDb(
      url,
      null,
      async (db) => {
        const r = await aplicarEventoAsaas(
          db,
          evento('evt_t37_par_a', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00'),
        );
        primeiroGravou.disparar();
        await soltar.promessa;
        return r.resultado;
      },
      { confirmar: true },
    );
    await primeiroGravou.promessa;
    // Mais antigo que o primeiro: depois de esperar a trava da assinatura, vê o ultimo_evento_em dele e não aplica.
    const segundo = comDb(
      url,
      null,
      async (db) =>
        (await aplicarEventoAsaas(db, evento('evt_t37_par_b', 'SUBSCRIPTION_DELETED', '2026-11-05 11:00:00', null)))
          .resultado,
      { confirmar: true },
    );

    await esperarNaTrava();
    await esperar(SEGURAR_MS);
    soltar.disparar();

    expect(await primeiro).toBe('aplicado');
    expect(await segundo).toBe('sem_efeito');
    expect(await estado()).toMatchObject({ grupo: 'ativo', assinatura: { situacao: 'ativa' } });
  });
});

describe('webhook em sequência', () => {
  it('PLA-73: primeiro envio com 429, reenvio aceito e um efeito só', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const corpo = evento('evt_t37_429', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00');
    expect((await enviar(corpo, nega)).status).toBe(429);
    expect((await estado()).grupo).toBe('trial');
    expect((await enviar(corpo)).status).toBe(200);
    expect((await enviar(corpo)).status).toBe(200);
    expect(await auditorias('plano_ativado')).toBe(1);
    expect((await estado()).grupo).toBe('ativo');
  });

  it('PLA-48: PAYMENT_CREATED atrasado depois do pagamento deixa o grupo ativo', async () => {
    await preparar('trial', 'aguardando_pagamento');
    expect(
      (await enviar(evento('evt_t37_recebido', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00'))).status,
    ).toBe(200);
    expect(
      (await enviar(evento('evt_t37_criado', 'PAYMENT_CREATED', '2026-11-05 10:00:00'))).status,
    ).toBe(200);
    expect(await estado()).toEqual({
      grupo: 'ativo',
      assinatura: { situacao: 'ativa', pago_ate: '2026-12-05', cobranca_pro_id: 'pay_t37_1' },
    });
  });

  it('PLA-48: atraso antigo depois do pagamento não derruba o Pro', async () => {
    await preparar('trial', 'aguardando_pagamento');
    await enviar(evento('evt_t37_pago', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00'));
    await enviar(
      evento('evt_t37_atraso_velho', 'PAYMENT_OVERDUE', '2026-11-05 09:00:00', {
        id: 'pay_t37_1',
        dueDate: '2026-12-05',
      }),
    );
    expect((await estado()).grupo).toBe('ativo');
    expect(await auditorias('plano_inadimplente')).toBe(0);
  });

  it('PLA-74: no 16º dia o plano é free; depois do webhook de pagamento, pro, sem perda de linha', async () => {
    await preparar('trial', 'aguardando_pagamento', '2026-11-01');
    const antes = await linhasDoGrupo();
    expect(await planoEm('2026-11-16T15:00:00Z')).toMatchObject({ plano: 'free', situacao: 'trial' });

    expect(
      (
        await enviar(
          evento('evt_t37_depois_do_trial', 'PAYMENT_RECEIVED', '2026-11-16 09:00:00', {
            id: 'pay_t37_1',
            dueDate: '2026-11-16',
          }),
        )
      ).status,
    ).toBe(200);

    expect(await planoEm('2026-11-16T15:00:00Z')).toMatchObject({
      plano: 'pro',
      situacao: 'ativo',
      pagoAte: '2026-12-16',
      somenteLeitura: null,
    });
    expect(await linhasDoGrupo()).toEqual(antes);
  });

  it('PLA-72: lote de 5 eventos atrasados fora de ordem termina no estado do mais recente', async () => {
    await preparar('ativo', 'ativa');
    // A fila ficou pausada e os 5 chegam juntos, embaralhados. Em ordem de dateCreated: CREATED pay2 (11-20),
    // OVERDUE pay2 (12-06 08:00), REFUNDED de outra (12-06 09:00), RECEIVED pay2 (12-07 09:00), CREATED pay3
    // (12-07 10:00, não tratado). O mais recente com efeito é o RECEIVED pay2: Pro até 2027-01-05.
    const lote = [
      evento('evt_t37_l1', 'PAYMENT_RECEIVED', '2026-12-07 09:00:00', {
        id: 'pay_t37_2',
        dueDate: '2026-12-05',
      }),
      evento('evt_t37_l2', 'PAYMENT_OVERDUE', '2026-12-06 08:00:00', {
        id: 'pay_t37_2',
        dueDate: '2026-12-05',
      }),
      evento('evt_t37_l3', 'PAYMENT_CREATED', '2026-11-20 10:00:00', {
        id: 'pay_t37_2',
        dueDate: '2026-12-05',
      }),
      evento('evt_t37_l4', 'PAYMENT_REFUNDED', '2026-12-06 09:00:00', { id: 'pay_t37_outra' }),
      evento('evt_t37_l5', 'PAYMENT_CREATED', '2026-12-07 10:00:00', {
        id: 'pay_t37_3',
        dueDate: '2027-01-05',
      }),
    ];
    for (const corpo of lote) expect((await enviar(corpo)).status).toBe(200);

    expect(await estado()).toEqual({
      grupo: 'ativo',
      assinatura: { situacao: 'ativa', pago_ate: '2027-01-05', cobranca_pro_id: 'pay_t37_2' },
    });
    expect(await auditorias('plano_inadimplente')).toBe(0);
    expect(await auditorias('plano_ativado')).toBe(1);
  });
});
