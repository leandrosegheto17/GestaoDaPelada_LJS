import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assinaturaCriada,
  erroAssinaturaPendente,
  erroPagamentoIndisponivel,
  MENSAGEM_PAGAMENTO_INDISPONIVEL,
  planoResposta,
} from '@pelada/contrato';
import type { LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { chaveConta } from '../../src/entrada/middlewares/limite-escrita.ts';
import { asaasMemoria } from '../../src/infraestrutura/asaas/memoria.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `POST /api/grupos/:grupoId/assinatura` (planos-e-cobranca T33; PLA-30 a PLA-33, PLA-60), com o app real como
 * `pelada_app`, o Asaas em memória e o relógio fixo em 2026-11-05 (12h de São Paulo). B cria H (sem assinatura);
 * G (de C, com O convidada) tem a cancelada do cenário. G e H são postos em `trial` desde 2026-11-01. O `afterEach`
 * apaga as assinaturas criadas (ids `sub_…` do Asaas em memória) e as auditorias delas.
 *
 * Evidência da rede (registrar na T33 do tasks.md, pelo /executar): trocar a ordem para chamar o Asaas antes de
 * conferir a criadora deixa vermelho "o Asaas em memória não recebeu chamada".
 */

const CORPO = { nome: 'Bia Souza', cpf: '529.982.247-25' };
const asaas = asaasMemoria();
let aberto: CenarioGruposAberto;
let originais: Array<{ id: string; s: string; t: string | null }> = [];

function app() {
  return criarApp({
    fabricaBanco: fabricaComoApp().fabrica,
    relogio: relogioFixo('2026-11-05T15:00:00Z'),
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

interface Pedido {
  metodo?: string;
  conta?: string;
  corpo?: unknown;
  limite?: LimiteDeTaxa;
  caminho?: string;
}

async function pedir(grupo: string, p: Pedido = {}): Promise<Response> {
  const headers = new Headers({ 'x-pelada': '1', 'content-type': 'application/json' });
  if (p.conta) headers.set('cookie', `${NOME_COOKIE_SESSAO}=${await sessao(p.conta)}`);
  const ctx = contextoFalso();
  const metodo = p.metodo ?? 'POST';
  const r = await app().request(
    `/api/grupos/${grupo}${p.caminho ?? '/assinatura'}`,
    {
      method: metodo,
      headers,
      ...(metodo === 'GET' ? {} : { body: JSON.stringify(p.corpo ?? CORPO) }),
    },
    envAcesso(aberto.url, p.limite ? { LIMITE_ESCRITA: p.limite } : {}),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function assinaturasNovas(grupo: string): Promise<number> {
  const r = await aberto.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM assinaturas WHERE grupo_id = $1 AND situacao <> 'cancelada'`,
    [grupo],
  );
  return r.rows[0]!.n;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  // O cenário semeia uma assinatura cancelada por grupo (T10). B "nunca assinou" aqui: sem cliente do Asaas guardado.
  await db.query('DELETE FROM assinaturas WHERE criada_por = $1', [cenario.contaB]);
  for (const id of [cenario.grupoG, cenario.grupoH]) {
    const r = await db.query<{ s: string; t: string | null }>(
      'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
      [id],
    );
    originais.push({ id, ...r.rows[0]! });
    await db.query(
      `UPDATE grupos SET situacao_comercial = 'trial', trial_inicio = '2026-11-01' WHERE id = $1`,
      [id],
    );
  }
});

beforeEach(() => {
  asaas.limpar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(
    `DELETE FROM auditoria WHERE grupo_id = ANY($1::uuid[]) AND acao IN ('plano_assinado', 'plano_cancelado')
       AND entidade_id IN (SELECT id::text FROM assinaturas WHERE asaas_assinatura_id LIKE 'sub\\_%' ESCAPE '\\')`,
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

describe('POST …/assinatura', () => {
  it('PLA-30: a criadora recebe 201 com a faturaUrl e a assinatura fica aguardando o pagamento', async () => {
    const { cenario } = aberto;
    const r = await pedir(cenario.grupoH, { conta: cenario.contaB });
    expect(r.status).toBe(201);
    const corpo = assinaturaCriada.parse(await r.json());
    const linha = await aberto.db.query<{ situacao: string; fatura_url: string }>(
      `SELECT situacao, fatura_url FROM assinaturas WHERE grupo_id = $1 AND situacao <> 'cancelada'`,
      [cenario.grupoH],
    );
    expect(linha.rows).toEqual([{ situacao: 'aguardando_pagamento', fatura_url: corpo.faturaUrl }]);
  });

  it('PLA-31: depois do 201, GET …/plano segue trial', async () => {
    const { cenario } = aberto;
    expect((await pedir(cenario.grupoH, { conta: cenario.contaB })).status).toBe(201);
    const plano = await pedir(cenario.grupoH, {
      conta: cenario.contaB,
      metodo: 'GET',
      caminho: '/plano',
    });
    expect(planoResposta.parse(await plano.json())).toMatchObject({
      plano: 'trial',
      situacao: 'trial',
      assinatura: { situacao: 'aguardando_pagamento' },
    });
  });

  it('PLA-32: admin convidada recebe 403 e o Asaas em memória não recebeu chamada', async () => {
    const { cenario } = aberto;
    const r = await pedir(cenario.grupoG, { conta: cenario.contaO });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'so_quem_criou' });
    expect(asaas.chamadas).toEqual([]);
    expect(await assinaturasNovas(cenario.grupoG)).toBe(0);
  });

  it('PLA-02 (A-04): grupo de cortesia recebe 409 grupo_cortesia e o Asaas não recebe chamada', async () => {
    const { cenario, db } = aberto;
    await db.query(
      `UPDATE grupos SET situacao_comercial = 'uso_proprio', trial_inicio = NULL WHERE id = $1`,
      [cenario.grupoH],
    );
    try {
      const r = await pedir(cenario.grupoH, { conta: cenario.contaB });
      expect(r.status).toBe(409);
      expect(await r.json()).toMatchObject({
        erro: 'grupo_cortesia',
        mensagem: 'Este grupo tem o Pro de cortesia e não precisa de assinatura.',
      });
      expect(asaas.chamadas).toEqual([]);
      expect(await assinaturasNovas(cenario.grupoH)).toBe(0);
    } finally {
      await db.query(
        `UPDATE grupos SET situacao_comercial = 'trial', trial_inicio = '2026-11-01' WHERE id = $1`,
        [cenario.grupoH],
      );
    }
  });

  it('PLA-33: segundo POST recebe 409 com a mesma faturaUrl', async () => {
    const { cenario } = aberto;
    const primeiro = assinaturaCriada.parse(
      await (await pedir(cenario.grupoH, { conta: cenario.contaB })).json(),
    );
    asaas.chamadas.length = 0;
    const segundo = await pedir(cenario.grupoH, { conta: cenario.contaB });
    expect(segundo.status).toBe(409);
    expect(erroAssinaturaPendente.parse(await segundo.json())).toMatchObject({
      erro: 'assinatura_pendente',
      faturaUrl: primeiro.faturaUrl,
    });
    expect(asaas.chamadas).toEqual([]);
    expect(await assinaturasNovas(cenario.grupoH)).toBe(1);
  });

  it('PLA-36: Asaas com falha responde 502 com a mensagem da spec, sem gravar', async () => {
    const { cenario } = aberto;
    asaas.falharSempre('criarCliente');
    const r = await pedir(cenario.grupoH, { conta: cenario.contaB });
    expect(r.status).toBe(502);
    expect(erroPagamentoIndisponivel.parse(await r.json()).mensagem).toBe(
      MENSAGEM_PAGAMENTO_INDISPONIVEL,
    );
    expect(await assinaturasNovas(cenario.grupoH)).toBe(0);
  });

  it('PLA-35: CPF inválido responde 422 sem chamar o Asaas', async () => {
    const { cenario } = aberto;
    const r = await pedir(cenario.grupoH, {
      conta: cenario.contaB,
      corpo: { nome: 'Bia Souza', cpf: '111.111.111-11' },
    });
    expect(r.status).toBe(422);
    expect(asaas.chamadas).toEqual([]);
  });

  it('PLA-34: campo de cartão no corpo é recusado (422)', async () => {
    const { cenario } = aberto;
    const r = await pedir(cenario.grupoH, {
      conta: cenario.contaB,
      corpo: { ...CORPO, numeroCartao: '4111111111111111' },
    });
    expect(r.status).toBe(422);
    expect(asaas.chamadas).toEqual([]);
  });

  it('PLA-60: sem sessão, 401', async () => {
    const { cenario } = aberto;
    const r = await pedir(cenario.grupoH);
    expect(r.status).toBe(401);
    expect(asaas.chamadas).toEqual([]);
  });

  it('PLA-60: a 61.ª escrita da conta, 429', async () => {
    const { cenario } = aberto;
    const usadas = new Map<string, number>([[chaveConta(cenario.contaB), 60]]);
    const limite: LimiteDeTaxa = {
      limit: async ({ key }) => {
        const n = (usadas.get(key) ?? 0) + 1;
        usadas.set(key, n);
        return { success: n <= 60 };
      },
    };
    const r = await pedir(cenario.grupoH, { conta: cenario.contaB, limite });
    expect(r.status).toBe(429);
    expect(asaas.chamadas).toEqual([]);
    expect(await assinaturasNovas(cenario.grupoH)).toBe(0);
  });

  it('PLA-09: conta B no grupo G recebe 404', async () => {
    const { cenario } = aberto;
    expect((await pedir(cenario.grupoG, { conta: cenario.contaB })).status).toBe(404);
    expect(asaas.chamadas).toEqual([]);
  });
});
