import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { recursoLiberadoPeloPlano } from '../../src/aplicacao/plano/recurso-liberado.ts';
import { criarCliente } from '../../src/infraestrutura/db/cliente.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import { kyselyDoCliente } from '../../src/infraestrutura/db/transacao.ts';
import { filaMemoria } from '../../src/infraestrutura/fila/avisos.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { comoAppAqui, comoSuper, numaTransacao, umaLinha } from '../banco/apoio-conta.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioConta, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';
import {
  abrirCenarioGrupos,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * Rede de proteção da `notificacoes` (T0; NOT-20, NOT-38, NOT-55): o comportamento das features 4, 2 e 7 que as
 * tarefas seguintes estendem e precisam manter (S-01 a S-07). Testes de caracterização: descrevem o que o código faz
 * hoje, não o que a spec da `notificacoes` pede.
 *
 * - Partidas (S-07, `PR:1461`, `PR:1487`): `POST` 201 e `PUT` 200 com a partida relida; `DELETE` 204 sem corpo.
 * - Webhook do Asaas (S-03, `PC:176-187`): evento novo aplica e responde 200; o mesmo id de novo responde 200 sem
 *   mudar nada (PLA-42); evento anterior ao último aplicado responde 200 sem mudar nada (PLA-48).
 * - `conta_excluir` (S-06, `M:1792843800000_conta-senha-bloqueio.sql:149`): grava `excluida_em` e não apaga a linha.
 * - `recursoLiberado(db, grupoId, 'push')` (S-01, `PC:79`): no contexto do slug do próprio grupo e sem contexto.
 *
 * Rascunho escrito depois da T21 e da T22 (as features 4 e 7 só existiam como rascunho quando o lote 1 foi adiado):
 * os casos de partida e de webhook usam a fila em memória para que o `aposCommit` dessas tarefas não interfira. O
 * vermelho (comportamento trocado) é do /executar, que o registra na T0 do tasks.md.
 */

const AGORA = '2026-03-14T15:00:00Z';
const DATA = '2026-03-12';
const DATA_DO_CENARIO = '2026-01-08';

// ---------------------------------------------------------------------------------------------------------------
// Partidas (S-07)
// ---------------------------------------------------------------------------------------------------------------

describe('caracterização: rotas de partida (S-07)', () => {
  let aberto: CenarioGruposAberto;
  const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo(AGORA) });

  async function sessao(conta: string): Promise<string> {
    const { token, hash } = await gerarToken();
    await aberto.db.query(
      `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
       VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
      [Buffer.from(hash), conta],
    );
    return token;
  }

  async function pedir(metodo: string, caminho: string, corpo?: unknown): Promise<Response> {
    const headers = new Headers({
      'x-pelada': '1',
      'content-type': 'application/json',
      cookie: `${NOME_COOKIE_SESSAO}=${await sessao(aberto.cenario.contaC)}`,
    });
    const ctx = contextoFalso();
    const env: Env = envAcesso(aberto.url, { FILA_AVISOS: filaMemoria() });
    const r = await app.request(
      `/api/grupos/${aberto.cenario.grupoG}${caminho}`,
      { method: metodo, headers, ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) },
      env,
      ctx,
    );
    await ctx.esperar();
    return r;
  }

  function corpoDaPartida(data: string, choveu = false) {
    return {
      data,
      choveu,
      marcacoes: [{ jogadorId: aberto.cenario.idsG.jogadorAtivo, situacao: 'presente' }],
    };
  }

  beforeAll(async () => {
    aberto = await abrirCenarioGrupos();
    await reativar(aberto.db, aberto.cenario.grupoG);
  });

  afterEach(async () => {
    await aberto.db.query('DELETE FROM partidas WHERE grupo_id = $1 AND id <> $2', [
      aberto.cenario.grupoG,
      aberto.cenario.idsG.partida,
    ]);
  });

  afterAll(async () => {
    await aberto?.fechar();
  });

  it('NOT-20: POST de partida responde 201 com a partida relida (data, chuva, marcações e hoje)', async () => {
    const r = await pedir('POST', '/partidas', corpoDaPartida(DATA, true));
    expect(r.status).toBe(201);
    const corpo = (await r.json()) as Record<string, unknown>;
    expect(corpo).toMatchObject({ data: DATA, choveu: true, hoje: '2026-03-14' });
    expect(JSON.stringify(corpo)).toContain(aberto.cenario.idsG.jogadorAtivo);
  });

  it('NOT-20: PUT de partida responde 200 com a partida relida', async () => {
    const r = await pedir('PUT', `/partidas/${DATA_DO_CENARIO}`, corpoDaPartida(DATA_DO_CENARIO, true));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ data: DATA_DO_CENARIO, choveu: true, hoje: '2026-03-14' });
  });

  it('NOT-20: DELETE de partida responde 204 sem corpo e a partida some', async () => {
    expect((await pedir('POST', '/partidas', corpoDaPartida(DATA))).status).toBe(201);
    const r = await pedir('DELETE', `/partidas/${DATA}`);
    expect(r.status).toBe(204);
    expect(await r.text()).toBe('');
    const n = await aberto.db.query('SELECT 1 FROM partidas WHERE grupo_id = $1 AND data = $2', [
      aberto.cenario.grupoG,
      DATA,
    ]);
    expect(n.rowCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Webhook do Asaas (S-03)
// ---------------------------------------------------------------------------------------------------------------

describe('caracterização: webhook do Asaas (S-03)', () => {
  const TOKEN = 'token-do-webhook-de-teste-t0-not-abcdef';
  const SUB = 'sub_t0_not';
  let aberto: CenarioGruposAberto;
  let original: { s: string; t: string | null } | null = null;

  async function preparar(grupo: 'trial' | 'ativo', assinatura: 'aguardando_pagamento' | 'ativa') {
    const { db, cenario } = aberto;
    await db.query('UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3 WHERE id = $1', [
      cenario.grupoH,
      grupo,
      grupo === 'trial' ? '2026-11-01' : null,
    ]);
    const paga = assinatura === 'ativa';
    await db.query(
      `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, fatura_url,
         pago_ate, cobranca_pro_id, ultimo_evento_em, criada_por, criada_em)
       VALUES ($1, 'cus_t0_not', $2, 990, $3, 'https://sandbox.asaas.com/i/pay_t0_not_1', $4, $5, $6, $7, now())`,
      [
        cenario.grupoH,
        SUB,
        assinatura,
        paga ? '2026-12-05' : null,
        paga ? 'pay_t0_not_1' : null,
        paga ? '2026-11-05 11:00:00-03' : null,
        cenario.contaB,
      ],
    );
  }

  async function enviar(corpo: unknown): Promise<Response> {
    const ctx = contextoFalso();
    const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica });
    const r = await app.request(
      '/api/webhooks/asaas',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'asaas-access-token': TOKEN },
        body: JSON.stringify(corpo),
      },
      envAcesso(aberto.url, { ASAAS_WEBHOOK_TOKEN: TOKEN, FILA_AVISOS: filaMemoria() }),
      ctx,
    );
    await ctx.esperar();
    return r;
  }

  function pagamento(id: string, evento: string, dataCriacao: string) {
    return {
      id,
      event: evento,
      dateCreated: dataCriacao,
      payment: {
        id: 'pay_t0_not_1',
        subscription: SUB,
        value: 9.9,
        dueDate: '2026-11-05',
        status: 'RECEIVED',
      },
    };
  }

  async function estado() {
    const { db, cenario } = aberto;
    const g = await db.query<{ s: string }>('SELECT situacao_comercial AS s FROM grupos WHERE id = $1', [
      cenario.grupoH,
    ]);
    const a = await db.query<{ situacao: string; pago_ate: string | null; ultimo: string | null }>(
      `SELECT situacao, pago_ate::text AS pago_ate, ultimo_evento_em::text AS ultimo
         FROM assinaturas WHERE asaas_assinatura_id = $1`,
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

  afterEach(async () => {
    const { db } = aberto;
    await db.query(
      `DELETE FROM auditoria WHERE entidade_id IN (SELECT id::text FROM assinaturas WHERE asaas_assinatura_id = $1)`,
      [SUB],
    );
    await db.query(`DELETE FROM eventos_asaas WHERE id LIKE 'evt\\_t0not\\_%' ESCAPE '\\'`);
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

  it('NOT-38: evento novo responde 200 e aplica (grupo ativo, assinatura ativa)', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const r = await enviar(pagamento('evt_t0not_novo', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ recebido: true });
    expect(await estado()).toMatchObject({
      grupo: 'ativo',
      assinatura: { situacao: 'ativa', pago_ate: '2026-12-05' },
    });
  });

  it('NOT-38: o mesmo evento de novo responde 200 e não muda nada (PLA-42)', async () => {
    await preparar('trial', 'aguardando_pagamento');
    const corpo = pagamento('evt_t0not_repetido', 'PAYMENT_RECEIVED', '2026-11-05 12:00:00');
    expect((await enviar(corpo)).status).toBe(200);
    const depoisDoPrimeiro = await estado();
    expect((await enviar(corpo)).status).toBe(200);
    expect(await estado()).toEqual(depoisDoPrimeiro);
    const n = await aberto.db.query(`SELECT 1 FROM eventos_asaas WHERE id = 'evt_t0not_repetido'`);
    expect(n.rowCount).toBe(1);
  });

  it('NOT-38: evento anterior ao último aplicado (obsoleto, PLA-48) responde 200 e não muda nada', async () => {
    await preparar('ativo', 'ativa');
    const antes = await estado();
    const r = await enviar(pagamento('evt_t0not_obsoleto', 'PAYMENT_OVERDUE', '2026-11-01 08:00:00'));
    expect(r.status).toBe(200);
    expect(await estado()).toEqual(antes);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// conta_excluir (S-06)
// ---------------------------------------------------------------------------------------------------------------

describe('caracterização: conta_excluir (S-06)', () => {
  let aberto: CenarioContaAberto;

  beforeAll(async () => {
    aberto = await abrirCenarioConta();
  });

  afterAll(async () => {
    await aberto?.fechar();
  });

  it('NOT-55: conta_excluir grava excluida_em e não apaga a linha da conta', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      // A conta A deixa de ser a única admin do grupo A (com `unico_admin` a exclusão é recusada).
      await db.query(
        `INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $3, now())`,
        [cenario.contaSemVinculo, cenario.grupoA, cenario.contaA],
      );
      await comoAppAqui(db, cenario.contaA);
      const r = await umaLinha<{ resultado: string }>(db, 'SELECT * FROM conta_excluir($1)', [
        cenario.senhaA,
      ]);
      await comoSuper(db);
      expect(r.resultado).toBe('ok');
      const conta = await db.query<{ excluida: boolean }>(
        'SELECT excluida_em IS NOT NULL AS excluida FROM contas WHERE id = $1',
        [cenario.contaA],
      );
      expect(conta.rows).toEqual([{ excluida: true }]);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// recursoLiberado(db, grupoId, 'push') (S-01)
// ---------------------------------------------------------------------------------------------------------------

describe('caracterização: recursoLiberado para push (S-01)', () => {
  let aberto: CenarioGruposAberto;
  let original: { s: string; t: string | null } | null = null;

  /** Como o `comDb` (`test/repositorios/apoio.ts`), com o slug no contexto em vez da conta. */
  async function comContexto<T>(
    contexto: { conta?: string; slug?: string },
    fn: (db: Db) => Promise<T>,
  ): Promise<T> {
    const cliente = criarCliente(aberto.url, {
      fabrica: fabricaComoApp().fabrica,
      aoAbrir: async (consultar) => {
        await consultar('BEGIN');
        await consultar(
          `SELECT set_config('app.conta_id', $1, true), set_config('app.slug_publico', $2, true)`,
          [contexto.conta ?? '', contexto.slug ?? ''],
        );
      },
    });
    try {
      const resultado = await fn(kyselyDoCliente(cliente));
      if (cliente.aberto()) await cliente.consultar('ROLLBACK');
      return resultado;
    } finally {
      await cliente.fechar();
    }
  }

  const liberado = (contexto: { conta?: string; slug?: string }) =>
    comContexto(contexto, (db) =>
      recursoLiberadoPeloPlano(relogioFixo('2026-11-20T15:00:00Z'))(db, aberto.cenario.grupoG, 'push'),
    );

  beforeAll(async () => {
    aberto = await abrirCenarioGrupos();
    const r = await aberto.db.query<{ s: string; t: string | null }>(
      'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
      [aberto.cenario.grupoG],
    );
    original = r.rows[0]!;
  });

  afterEach(async () => {
    if (original) {
      await aberto.db.query(
        'UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1',
        [aberto.cenario.grupoG, original.s, original.t],
      );
    }
  });

  afterAll(async () => {
    await aberto?.fechar();
  });

  async function situacaoDeG(situacao: string): Promise<void> {
    await aberto.db.query(
      'UPDATE grupos SET situacao_comercial = $2, trial_inicio = NULL WHERE id = $1',
      [aberto.cenario.grupoG, situacao],
    );
  }

  it('NOT-20: no contexto do slug do próprio grupo, Pro libera push e inadimplente nega', async () => {
    await situacaoDeG('ativo');
    expect(await liberado({ slug: aberto.cenario.slugG })).toBe(true);
    await situacaoDeG('inadimplente');
    expect(await liberado({ slug: aberto.cenario.slugG })).toBe(false);
  });

  it('NOT-20: com a conta da criadora, Pro libera push', async () => {
    await situacaoDeG('ativo');
    expect(await liberado({ conta: aberto.cenario.contaC })).toBe(true);
  });

  // [LACUNA] S-01 sem contexto: `recurso-liberado.ts:29` diz que o grupo que o contexto não enxerga dá `false`
  // (a `plano_do_grupo` não responde sem conta nem slug). Se o /executar confirmar, S-01 não vale para o consumidor da
  // fila e a T10 e a T18 seguem o plano B da S-01 (pergunta antes do lote 2).
  it('NOT-20: sem conta e sem slug (contexto do consumidor da fila), Pro dá false', async () => {
    await situacaoDeG('ativo');
    expect(await liberado({})).toBe(false);
  });
});
