import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { planoResposta } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `GET /api/grupos/:grupoId/plano` (planos-e-cobranca T24; PLA-08, PLA-09, PLA-71), com o app real como `pelada_app`
 * e o relógio fixo. G (de C, com O convidada) é posto em `trial` desde 2026-11-01 como superusuário em cada teste; o
 * `afterAll` devolve a situação original. G tem 2 ativos e a assinatura cancelada `sub_g` (cenário da T12).
 *
 * Evidência da rede (registrar na T24 do tasks.md, pelo /executar): trocar o `relogio.hoje()` da rota por
 * `new Date().toISOString().slice(0, 10)` (UTC) deixa vermelho "02:59Z é trial"; tirar a comparação com `criadoPor`
 * deixa vermelho "convidada recebe podeAssinar falso".
 */

let aberto: CenarioGruposAberto;
let original: { s: string; t: string | null };

function app(agora: string) {
  return criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo(agora) });
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

async function lerPlano(
  grupo: string,
  conta: string,
  agora = '2026-11-05T15:00:00Z',
): Promise<Response> {
  const headers = new Headers({ cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}` });
  const ctx = contextoFalso();
  const r = await app(agora).request(
    `/api/grupos/${grupo}/plano`,
    { method: 'GET', headers },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function situacao(s: string, t: string | null): Promise<void> {
  await aberto.db.query(
    'UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1',
    [aberto.cenario.grupoG, s, t],
  );
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ s: string; t: string | null }>(
    'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
    [aberto.cenario.grupoG],
  );
  original = r.rows[0]!;
});

beforeEach(async () => {
  await situacao('trial', '2026-11-01');
});

afterEach(async () => {
  await aberto.db.query(`DELETE FROM assinaturas WHERE asaas_assinatura_id LIKE 'sub_t24_%'`);
});

afterAll(async () => {
  if (aberto) {
    await situacao(original.s, original.t);
    await aberto.fechar();
  }
});

describe('GET …/plano', () => {
  it('PLA-08: criadora em trial recebe trialFimEm e podeAssinar verdadeiro', async () => {
    const { cenario } = aberto;
    const r = await lerPlano(cenario.grupoG, cenario.contaC);
    expect(r.status).toBe(200);
    const corpo = planoResposta.parse(await r.json());
    expect(corpo).toEqual({
      plano: 'trial',
      situacao: 'trial',
      trialFimEm: '2026-11-14',
      pagoAte: '2026-01-05',
      jogadoresAtivos: 2,
      limiteJogadores: null,
      somenteLeitura: null,
      recursos: ['partidas', 'ranking', 'simulador', 'financeiro', 'pdf', 'push'],
      podeAssinar: true,
      assinatura: { situacao: 'cancelada', faturaUrl: null },
    });
  });

  it('PLA-08: admin convidada recebe podeAssinar falso', async () => {
    const { cenario } = aberto;
    const r = await lerPlano(cenario.grupoG, cenario.contaO);
    expect(r.status).toBe(200);
    expect(planoResposta.parse(await r.json())).toMatchObject({
      plano: 'trial',
      podeAssinar: false,
    });
  });

  it('PLA-08: no Free, limite 20, só partidas e ranking, sem trialFimEm', async () => {
    const { cenario } = aberto;
    const r = await lerPlano(cenario.grupoG, cenario.contaC, '2026-11-20T15:00:00Z');
    expect(planoResposta.parse(await r.json())).toMatchObject({
      plano: 'free',
      situacao: 'trial',
      trialFimEm: null,
      limiteJogadores: 20,
      somenteLeitura: null,
      recursos: ['partidas', 'ranking'],
    });
  });

  it('PLA-08: assinatura aguardando o pagamento traz a fatura', async () => {
    const { db, cenario } = aberto;
    await db.query(
      `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, fatura_url,
         criada_por, criada_em)
       VALUES ($1, 'cus_t24', 'sub_t24_pendente', 990, 'aguardando_pagamento', 'https://sandbox.asaas.com/i/t24', $2, now())`,
      [cenario.grupoG, cenario.contaC],
    );
    const r = await lerPlano(cenario.grupoG, cenario.contaC);
    expect(planoResposta.parse(await r.json()).assinatura).toEqual({
      situacao: 'aguardando_pagamento',
      faturaUrl: 'https://sandbox.asaas.com/i/t24',
    });
  });

  it('PLA-08: assinatura ativa com o grupo em dia não mostra a fatura', async () => {
    const { db, cenario } = aberto;
    await situacao('ativo', null);
    await db.query(
      `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, fatura_url,
         pago_ate, criada_por, criada_em)
       VALUES ($1, 'cus_t24', 'sub_t24_ativa', 990, 'ativa', 'https://sandbox.asaas.com/i/t24a', '2026-12-05', $2, now())`,
      [cenario.grupoG, cenario.contaC],
    );
    const corpo = planoResposta.parse(
      await (await lerPlano(cenario.grupoG, cenario.contaC)).json(),
    );
    expect(corpo).toMatchObject({
      plano: 'pro',
      pagoAte: '2026-12-05',
      assinatura: { situacao: 'ativa', faturaUrl: null },
    });
  });

  it('PLA-09: conta B recebe 404 igual ao de grupo inexistente', async () => {
    const { cenario } = aberto;
    const deOutro = await lerPlano(cenario.grupoG, cenario.contaB);
    const inexistente = await lerPlano('00000000-0000-4000-8000-000000000000', cenario.contaB);
    expect(deOutro.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(await deOutro.json()).toEqual(await inexistente.json());
  });

  it('PLA-71: com o relógio em 02:59Z do 15º dia (23:59 de SP do 14º) o plano é trial', async () => {
    const { cenario } = aberto;
    const r = await lerPlano(cenario.grupoG, cenario.contaC, '2026-11-15T02:59:00Z');
    expect(planoResposta.parse(await r.json()).plano).toBe('trial');
  });

  it('PLA-71: com o relógio em 03:00Z do 15º dia (00:00 de SP) o plano é free', async () => {
    const { cenario } = aberto;
    const r = await lerPlano(cenario.grupoG, cenario.contaC, '2026-11-15T03:00:00Z');
    expect(planoResposta.parse(await r.json()).plano).toBe('free');
  });
});
