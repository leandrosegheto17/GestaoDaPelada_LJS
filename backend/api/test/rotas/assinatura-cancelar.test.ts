import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assinaturaCriada,
  erroPagamentoIndisponivel,
  erroSemAssinatura,
  MENSAGEM_PAGAMENTO_INDISPONIVEL,
  planoResposta,
} from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { asaasMemoria } from '../../src/infraestrutura/asaas/memoria.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `DELETE /api/grupos/:grupoId/assinatura` (planos-e-cobranca T34; PLA-55, PLA-56; AD-115), com o app real como
 * `pelada_app`, o Asaas em memória e o relógio fixo em 2026-11-05 (12h de São Paulo). Molde: `assinatura.test.ts`
 * (T33). B cria H; G é de C, com O convidada. A assinatura é criada pelo POST (Asaas em memória); a ativa é posta à mão,
 * como o webhook a deixaria (`ativa`, `pago_ate` 2026-12-05, grupo `ativo`).
 *
 * Evidência da rede (registrar na T34 do tasks.md, pelo /executar): trocar a ordem para gravar a `assinatura_cancelar`
 * antes de chamar o Asaas deixa vermelho o PLA-56 (grupo `cancelado` com o Asaas em falha).
 */

const CORPO = { nome: 'Bia Souza', cpf: '529.982.247-25' };
const PAGO_ATE = '2026-12-05';
const asaas = asaasMemoria();
let aberto: CenarioGruposAberto;
let originais: Array<{ id: string; s: string; t: string | null }> = [];

function app(agora = '2026-11-05T15:00:00Z') {
  return criarApp({
    fabricaBanco: fabricaComoApp().fabrica,
    relogio: relogioFixo(agora),
    asaas,
  });
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

async function pedir(
  grupo: string,
  metodo: 'POST' | 'DELETE' | 'GET',
  conta?: string,
  caminho = '/assinatura',
  agora?: string,
): Promise<Response> {
  const headers = new Headers({ 'x-pelada': '1', 'content-type': 'application/json' });
  if (conta) headers.set('cookie', `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`);
  const ctx = contextoFalso();
  const r = await app(agora).request(
    `/api/grupos/${grupo}${caminho}`,
    {
      method: metodo,
      headers,
      ...(metodo === 'POST' ? { body: JSON.stringify(CORPO) } : {}),
    },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

/** Cria a pendente pelo POST e devolve o id do Asaas em memória. */
async function criarPendente(grupo: string, conta: string): Promise<string> {
  const r = await pedir(grupo, 'POST', conta);
  expect(r.status).toBe(201);
  assinaturaCriada.parse(await r.json());
  const l = await aberto.db.query<{ a: string }>(
    `SELECT asaas_assinatura_id AS a FROM assinaturas
      WHERE grupo_id = $1 AND situacao = 'aguardando_pagamento'`,
    [grupo],
  );
  return l.rows[0]!.a;
}

/** Deixa a assinatura como o webhook de pagamento a deixaria (PLA-44). */
async function ativar(grupo: string): Promise<void> {
  await aberto.db.query(
    `UPDATE assinaturas SET situacao = 'ativa', pago_ate = $2::date
      WHERE grupo_id = $1 AND situacao = 'aguardando_pagamento'`,
    [grupo, PAGO_ATE],
  );
  await aberto.db.query(
    `UPDATE grupos SET situacao_comercial = 'ativo', trial_inicio = NULL WHERE id = $1`,
    [grupo],
  );
}

async function estado(grupo: string): Promise<{
  grupo: string;
  assinaturas: Array<{ situacao: string; pago_ate: string | null }>;
  auditorias: number;
}> {
  const g = await aberto.db.query<{ s: string }>(
    'SELECT situacao_comercial AS s FROM grupos WHERE id = $1',
    [grupo],
  );
  const a = await aberto.db.query<{ situacao: string; pago_ate: string | null }>(
    `SELECT situacao, pago_ate::text AS pago_ate FROM assinaturas
      WHERE grupo_id = $1 AND asaas_assinatura_id ~ '^sub_[0-9]{6}$' ORDER BY criada_em, id`,
    [grupo],
  );
  const au = await aberto.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM auditoria WHERE grupo_id = $1 AND acao = 'plano_cancelado'
       AND entidade_id IN (SELECT id::text FROM assinaturas WHERE asaas_assinatura_id ~ '^sub_[0-9]{6}$')`,
    [grupo],
  );
  return { grupo: g.rows[0]!.s, assinaturas: a.rows, auditorias: au.rows[0]!.n };
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  for (const id of [cenario.grupoG, cenario.grupoH]) {
    const r = await db.query<{ s: string; t: string | null }>(
      'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
      [id],
    );
    originais.push({ id, ...r.rows[0]! });
  }
});

beforeEach(async () => {
  asaas.limpar();
  const { db, cenario } = aberto;
  await db.query(
    `UPDATE grupos SET situacao_comercial = 'trial', trial_inicio = '2026-11-01' WHERE id = ANY($1::uuid[])`,
    [[cenario.grupoG, cenario.grupoH]],
  );
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(
    `DELETE FROM auditoria WHERE grupo_id = ANY($1::uuid[]) AND acao IN ('plano_assinado', 'plano_cancelado')
       AND entidade_id IN (SELECT id::text FROM assinaturas WHERE asaas_assinatura_id ~ '^sub_[0-9]{6}$')`,
    [[cenario.grupoG, cenario.grupoH]],
  );
  await db.query(
    `DELETE FROM assinaturas WHERE grupo_id = ANY($1::uuid[]) AND asaas_assinatura_id ~ '^sub_[0-9]{6}$'`,
    [[cenario.grupoG, cenario.grupoH]],
  );
});

afterAll(async () => {
  if (aberto) {
    for (const o of originais) {
      await aberto.db.query(
        'UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1',
        [o.id, o.s, o.t],
      );
    }
    await aberto.fechar();
  }
  originais = [];
});

describe('DELETE …/assinatura', () => {
  it('PLA-55: cancelar a ativa responde 204, grupo cancelado com o mesmo pagoAte e o plano segue pro até ele', async () => {
    const { cenario } = aberto;
    const asaasId = await criarPendente(cenario.grupoH, cenario.contaB);
    await ativar(cenario.grupoH);

    const r = await pedir(cenario.grupoH, 'DELETE', cenario.contaB);
    expect(r.status).toBe(204);
    expect(asaas.assinaturas.get(asaasId)?.removida).toBe(true);
    expect(await estado(cenario.grupoH)).toEqual({
      grupo: 'cancelado',
      assinaturas: [{ situacao: 'cancelada', pago_ate: PAGO_ATE }],
      auditorias: 1,
    });

    const noDia = await pedir(
      cenario.grupoH,
      'GET',
      cenario.contaB,
      '/plano',
      '2026-12-05T15:00:00Z',
    );
    expect(planoResposta.parse(await noDia.json())).toMatchObject({
      plano: 'pro',
      situacao: 'cancelado',
      pagoAte: PAGO_ATE,
    });
    const depois = await pedir(
      cenario.grupoH,
      'GET',
      cenario.contaB,
      '/plano',
      '2026-12-06T15:00:00Z',
    );
    expect(planoResposta.parse(await depois.json())).toMatchObject({ plano: 'free' });
  });

  it('PLA-56: Asaas em falha responde 502, o grupo segue ativo e não há auditoria plano_cancelado', async () => {
    const { cenario } = aberto;
    await criarPendente(cenario.grupoH, cenario.contaB);
    await ativar(cenario.grupoH);
    asaas.falharSempre('removerAssinatura');

    const r = await pedir(cenario.grupoH, 'DELETE', cenario.contaB);
    expect(r.status).toBe(502);
    expect(erroPagamentoIndisponivel.parse(await r.json()).mensagem).toBe(
      MENSAGEM_PAGAMENTO_INDISPONIVEL,
    );
    expect(await estado(cenario.grupoH)).toEqual({
      grupo: 'ativo',
      assinaturas: [{ situacao: 'ativa', pago_ate: PAGO_ATE }],
      auditorias: 0,
    });
    expect(asaas.chamadas.filter((c) => c.operacao === 'removerAssinatura')).toHaveLength(1);
  });

  it('PLA-55: cancelar a pendente responde 204, assinatura cancelada, grupo sem mudança e um novo POST é aceito (AD-115)', async () => {
    const { cenario } = aberto;
    const asaasId = await criarPendente(cenario.grupoH, cenario.contaB);

    const r = await pedir(cenario.grupoH, 'DELETE', cenario.contaB);
    expect(r.status).toBe(204);
    expect(asaas.assinaturas.get(asaasId)?.removida).toBe(true);
    expect(await estado(cenario.grupoH)).toEqual({
      grupo: 'trial',
      assinaturas: [{ situacao: 'cancelada', pago_ate: null }],
      auditorias: 1,
    });

    expect((await pedir(cenario.grupoH, 'POST', cenario.contaB)).status).toBe(201);
  });

  it('PLA-55: sem assinatura ativa nem pendente responde 409 sem_assinatura, sem chamar o Asaas', async () => {
    const { cenario } = aberto;
    const r = await pedir(cenario.grupoH, 'DELETE', cenario.contaB);
    expect(r.status).toBe(409);
    expect(erroSemAssinatura.parse(await r.json()).erro).toBe('sem_assinatura');
    expect(asaas.chamadas).toEqual([]);
  });

  it('PLA-55: a assinatura já cancelada responde 409 no segundo DELETE, sem nova chamada ao Asaas', async () => {
    const { cenario } = aberto;
    await criarPendente(cenario.grupoH, cenario.contaB);
    await ativar(cenario.grupoH);
    expect((await pedir(cenario.grupoH, 'DELETE', cenario.contaB)).status).toBe(204);
    asaas.chamadas.length = 0;

    expect((await pedir(cenario.grupoH, 'DELETE', cenario.contaB)).status).toBe(409);
    expect(asaas.chamadas).toEqual([]);
    expect((await estado(cenario.grupoH)).auditorias).toBe(1);
  });

  it('PLA-55: SUBSCRIPTION_DELETED gravado antes da resposta: 204, um estado final só', async () => {
    const { cenario, db } = aberto;
    const asaasId = await criarPendente(cenario.grupoH, cenario.contaB);
    await ativar(cenario.grupoH);
    // O webhook grava entre a leitura da vigente e a assinatura_cancelar: simulado pelo Asaas em memória, que ao
    // remover aplica o que o webhook aplicaria (assinatura cancelada e grupo cancelado), numa conexão à parte.
    const remover = asaas.removerAssinatura.bind(asaas);
    asaas.removerAssinatura = async (id) => {
      const r = await remover(id);
      await db.query(
        `UPDATE assinaturas SET situacao = 'cancelada' WHERE asaas_assinatura_id = $1`,
        [asaasId],
      );
      await db.query(
        `UPDATE grupos SET situacao_comercial = 'cancelado', trial_inicio = NULL WHERE id = $1`,
        [cenario.grupoH],
      );
      return r;
    };
    try {
      const r = await pedir(cenario.grupoH, 'DELETE', cenario.contaB);
      expect(r.status).toBe(204);
      const e = await estado(cenario.grupoH);
      expect(e.grupo).toBe('cancelado');
      expect(e.assinaturas).toEqual([{ situacao: 'cancelada', pago_ate: PAGO_ATE }]);
    } finally {
      asaas.removerAssinatura = remover;
    }
  });

  it('PLA-32: admin convidada recebe 403 e o Asaas em memória não recebeu chamada', async () => {
    const { cenario } = aberto;
    const r = await pedir(cenario.grupoG, 'DELETE', cenario.contaO);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'so_quem_criou' });
    expect(asaas.chamadas).toEqual([]);
  });

  it('PLA-60: sem sessão, 401, sem chamar o Asaas', async () => {
    const { cenario } = aberto;
    expect((await pedir(cenario.grupoH, 'DELETE')).status).toBe(401);
    expect(asaas.chamadas).toEqual([]);
  });

  it('PLA-09: conta B no grupo G recebe 404', async () => {
    const { cenario } = aberto;
    expect((await pedir(cenario.grupoG, 'DELETE', cenario.contaB)).status).toBe(404);
    expect(asaas.chamadas).toEqual([]);
  });
});
