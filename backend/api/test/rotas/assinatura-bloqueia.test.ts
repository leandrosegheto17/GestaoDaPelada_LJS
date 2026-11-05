import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  erroAssinaturaAtiva,
  MENSAGEM_CANCELE_ANTES_DE_ARQUIVAR,
  mensagemCanceleAntesDeExcluir,
} from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Assinatura vigente bloqueia arquivar o grupo e excluir a conta criadora (planos-e-cobranca T38; PLA-68, PLA-69;
 * AD-115), pelas rotas reais como `pelada_app`. H é de B (senha `senhaB` do cenário); G é de C, com O convidada. A
 * assinatura `sub_t38` é posta como superusuário no estado do caso e apagada no `afterEach`; o `arquivado_em` de H
 * volta a nulo também.
 *
 * Evidência da rede (registrar na T38 do tasks.md, pelo /executar): tirar a conferência da rota de arquivar deixa
 * vermelho o PLA-69 (`arquivado_em` preenchido); trocar `IN ('aguardando_pagamento', 'ativa')` por `= 'ativa'` deixa
 * vermelho o caso da pendente.
 */

const SUB = 'sub_t38';
let aberto: CenarioGruposAberto;
let nomeH = '';

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function pedir(caminho: string, conta: string, corpo: unknown): Promise<Response> {
  const ctx = contextoFalso();
  const r = await criarApp({ fabricaBanco: fabricaComoApp().fabrica }).request(
    `/api${caminho}`,
    {
      method: 'POST',
      headers: {
        'x-pelada': '1',
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.38',
        cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
      },
      body: JSON.stringify(corpo),
    },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function assinatura(grupo: string, situacao: 'aguardando_pagamento' | 'ativa' | 'cancelada') {
  const { db, cenario } = aberto;
  await db.query(
    `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, pago_ate,
       criada_por, criada_em)
     VALUES ($1, 'cus_t38', $2, 990, $3, $4, $5, now())`,
    [grupo, SUB, situacao, situacao === 'aguardando_pagamento' ? null : '2026-12-05', cenario.contaB],
  );
}

async function arquivadoEm(grupo: string): Promise<string | null> {
  const r = await aberto.db.query<{ a: string | null }>(
    'SELECT arquivado_em::text AS a FROM grupos WHERE id = $1',
    [grupo],
  );
  return r.rows[0]!.a;
}

async function contaB() {
  const r = await aberto.db.query<{ email: string; excluida_em: string | null }>(
    'SELECT email, excluida_em::text AS excluida_em FROM contas WHERE id = $1',
    [aberto.cenario.contaB],
  );
  const s = await aberto.db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM vinculos_admin WHERE conta_id = $1',
    [aberto.cenario.contaB],
  );
  return { ...r.rows[0]!, vinculos: s.rows[0]!.n };
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [
    aberto.cenario.grupoH,
  ]);
  nomeH = r.rows[0]!.nome;
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query('DELETE FROM assinaturas WHERE asaas_assinatura_id = $1', [SUB]);
  await db.query('UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [cenario.grupoH]);
});

afterAll(async () => {
  await aberto?.fechar();
});

describe('arquivar com assinatura (PLA-69)', () => {
  for (const situacao of ['ativa', 'aguardando_pagamento'] as const) {
    it(`PLA-69: arquivar grupo com assinatura ${situacao} responde 409 e arquivado_em segue nulo`, async () => {
      const { cenario } = aberto;
      await assinatura(cenario.grupoH, situacao);
      const r = await pedir(`/grupos/${cenario.grupoH}/arquivar`, cenario.contaB, {
        nomeConfirmacao: nomeH,
      });
      expect(r.status).toBe(409);
      expect(erroAssinaturaAtiva.parse(await r.json())).toMatchObject({
        erro: 'assinatura_ativa',
        mensagem: MENSAGEM_CANCELE_ANTES_DE_ARQUIVAR,
      });
      expect(await arquivadoEm(cenario.grupoH)).toBeNull();
    });
  }

  it('PLA-69: com a assinatura cancelada, arquivar segue (200)', async () => {
    const { cenario } = aberto;
    await assinatura(cenario.grupoH, 'cancelada');
    const r = await pedir(`/grupos/${cenario.grupoH}/arquivar`, cenario.contaB, {
      nomeConfirmacao: nomeH,
    });
    expect(r.status).toBe(200);
    expect(await arquivadoEm(cenario.grupoH)).not.toBeNull();
  });

  it('GEL-24: admin que não criou continua recebendo 403 so_quem_criou, mesmo com assinatura', async () => {
    const { db, cenario } = aberto;
    await db.query(
      `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, pago_ate,
         criada_por, criada_em)
       VALUES ($1, 'cus_t38', $2, 990, 'ativa', '2026-12-05', $3, now())`,
      [cenario.grupoG, SUB, cenario.contaC],
    );
    const r = await pedir(`/grupos/${cenario.grupoG}/arquivar`, cenario.contaO, {
      nomeConfirmacao: 'Pelada de Quinta',
    });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'so_quem_criou' });
  });
});

describe('excluir a conta com assinatura (PLA-68)', () => {
  for (const situacao of ['ativa', 'aguardando_pagamento'] as const) {
    it(`PLA-68: excluir a conta criadora com assinatura ${situacao} responde 409 com o nome do grupo e a conta fica intacta`, async () => {
      const { cenario } = aberto;
      await assinatura(cenario.grupoH, situacao);
      const antes = await contaB();
      const r = await pedir('/conta/excluir', cenario.contaB, { senha: cenario.senhaB });
      expect(r.status).toBe(409);
      expect(erroAssinaturaAtiva.parse(await r.json())).toMatchObject({
        erro: 'assinatura_ativa',
        mensagem: mensagemCanceleAntesDeExcluir(nomeH),
      });
      expect(await contaB()).toEqual(antes);
    });
  }

  it('PLA-68: senha errada com assinatura ativa também responde 409, sem gravar falha de senha', async () => {
    const { db, cenario } = aberto;
    await assinatura(cenario.grupoH, 'ativa');
    const falhas = async () =>
      (
        await db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM falhas_senha_atual WHERE conta_id = $1`,
          [cenario.contaB],
        )
      ).rows[0]!.n;
    const antes = await falhas();
    const r = await pedir('/conta/excluir', cenario.contaB, { senha: 'senha errada qualquer 1' });
    expect(r.status).toBe(409);
    expect(await falhas()).toBe(antes);
  });
});
