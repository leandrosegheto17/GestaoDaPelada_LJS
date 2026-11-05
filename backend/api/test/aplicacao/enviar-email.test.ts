import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  categoriaDaRecuperacao,
  enviarEmailDeConta,
  limiteEmailsDia,
  registrarOrigem,
  tetoDaCategoria,
  type PedidoEnvio,
} from '../../src/aplicacao/acesso/enviar-email.ts';
import {
  remetenteMemoria,
  remetenteResend,
  type Mensagem,
} from '../../src/infraestrutura/email/resend.ts';
import { fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioConta, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';
import { outraConexao } from '../banco/apoio-conta.ts';
import { comDb } from '../repositorios/apoio.ts';

/**
 * Envio de e-mail de conta com cota e intervalo (T24; ACE-51, ACE-52, ACE-72, ACE-73, ACE-75).
 * Contra um banco `teste_*` migrado; o contador do dia (`envios_email_dia`) e os pedidos por
 * origem são lidos e preparados como superusuário.
 */

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await aberto.db.query('DELETE FROM envios_email_dia');
  await aberto.db.query('DELETE FROM pedidos_email_origem');
});

const HOJE = `(now() AT TIME ZONE 'America/Sao_Paulo')::date`;

async function totalHoje(): Promise<number> {
  const r = await aberto.db.query<{ total: number }>(
    `SELECT total FROM envios_email_dia WHERE dia = ${HOJE}`,
  );
  return r.rows[0]?.total ?? 0;
}

async function definirTotalHoje(total: number): Promise<void> {
  await aberto.db.query(
    `INSERT INTO envios_email_dia (dia, total) VALUES (${HOJE}, $1) ON CONFLICT (dia) DO UPDATE SET total = $1`,
    [total],
  );
}

const MENSAGEM: Mensagem = {
  tipo: 'confirmacao',
  para: 'ana@exemplo.test',
  assunto: 'Confirme o seu e-mail',
  texto: 'link',
  html: '<p>link</p>',
  idempotencia: 'confirmacao:abc',
};

function pedido(extra: Partial<PedidoEnvio> = {}): PedidoEnvio {
  return { enviar: true, categoria: 'cadastro', limiteDia: 100, mensagem: MENSAGEM, ...extra };
}

/** Roda o envio numa transação como `pelada_app` e a confirma (a rota com 2xx faria COMMIT). */
function enviarConfirmando(remetente: Parameters<typeof enviarEmailDeConta>[1], p: PedidoEnvio) {
  return comDb(aberto.url, null, (db) => enviarEmailDeConta(db, remetente, p), { confirmar: true });
}

describe('regras puras', () => {
  it('ACE-72: teto de 80% para cadastro e 100% para recuperação; o 80.º sai e o 81.º não', () => {
    expect(tetoDaCategoria('cadastro', 100)).toBe(80);
    expect(tetoDaCategoria('recuperacao', 100)).toBe(100);
    expect(tetoDaCategoria('cadastro', 7)).toBe(5);
  });

  it('ACE-72: LIMITE_EMAILS_DIA ausente ou inválido vale 100', () => {
    expect(limiteEmailsDia(undefined)).toBe(100);
    expect(limiteEmailsDia('abc')).toBe(100);
    expect(limiteEmailsDia('0')).toBe(100);
    expect(limiteEmailsDia('-5')).toBe(100);
    expect(limiteEmailsDia('3000')).toBe(3000);
  });

  it('ACE-73: recuperação de conta não confirmada conta nos 80%', () => {
    expect(categoriaDaRecuperacao(false)).toBe('cadastro');
    expect(categoriaDaRecuperacao(true)).toBe('recuperacao');
  });
});

describe('enviarEmailDeConta', () => {
  it('ACE-51: segundo pedido em 30 s (enviar = false) devolve sucesso sem chamar o remetente nem gastar cota', async () => {
    const remetente = remetenteMemoria();
    expect(await enviarConfirmando(remetente, pedido({ enviar: false }))).toBe('enviado');
    expect(remetente.mensagens).toEqual([]);
    expect(await totalHoje()).toBe(0);
  });

  it('envio normal: chama o remetente e gasta 1 da cota', async () => {
    const remetente = remetenteMemoria();
    expect(await enviarConfirmando(remetente, pedido())).toBe('enviado');
    expect(remetente.mensagens).toHaveLength(1);
    expect(await totalHoje()).toBe(1);
  });

  it('ACE-52: falha do remetente dá indisponivel, a cota não é gasta e o pedido seguinte envia', async () => {
    const remetente = remetenteMemoria();
    remetente.falharProximos(1);
    expect(await enviarConfirmando(remetente, pedido())).toBe('indisponivel');
    expect(await totalHoje()).toBe(0);
    expect(await enviarConfirmando(remetente, pedido())).toBe('enviado');
    expect(await totalHoje()).toBe(1);
    expect(remetente.mensagens).toHaveLength(1);
  });

  it('ACE-75: remetente que demora (abortado pelo tempo limite) dá indisponivel sem gastar a cota', async () => {
    const lento: typeof fetch = (_url, init) =>
      new Promise((_resolver, rejeitar) => {
        init?.signal?.addEventListener('abort', () => rejeitar(new Error('abortado')));
      });
    const remetente = remetenteResend(
      { RESEND_API_KEY: 'chave', RESEND_REMETENTE: 'Pelada <nao-responda@exemplo.test>' },
      { fetch: lento, tempoLimiteMs: 50, registrar: () => undefined },
    );
    expect(await enviarConfirmando(remetente, pedido())).toBe('indisponivel');
    expect(await totalHoje()).toBe(0);
  });

  it('ACE-72: com 80 envios no dia, cadastro e convite dão indisponivel e recuperação envia', async () => {
    await definirTotalHoje(80);
    const remetente = remetenteMemoria();
    expect(await enviarConfirmando(remetente, pedido({ categoria: 'cadastro' }))).toBe(
      'indisponivel',
    );
    expect(
      await enviarConfirmando(
        remetente,
        pedido({ categoria: 'cadastro', mensagem: { ...MENSAGEM, tipo: 'convite' } }),
      ),
    ).toBe('indisponivel');
    expect(remetente.mensagens).toEqual([]);
    expect(
      await enviarConfirmando(
        remetente,
        pedido({ categoria: 'recuperacao', mensagem: { ...MENSAGEM, tipo: 'recuperacao' } }),
      ),
    ).toBe('enviado');
    expect(await totalHoje()).toBe(81);
  });

  it('ACE-72: com 79 envios, o 80.º de cadastro ainda sai', async () => {
    await definirTotalHoje(79);
    expect(await enviarConfirmando(remetenteMemoria(), pedido())).toBe('enviado');
    expect(await totalHoje()).toBe(80);
  });

  it('ACE-72: com 100 envios, nem a recuperação sai', async () => {
    await definirTotalHoje(100);
    expect(await enviarConfirmando(remetenteMemoria(), pedido({ categoria: 'recuperacao' }))).toBe(
      'indisponivel',
    );
  });

  it('ACE-75: trava da cota presa por mais de 2 s dá indisponivel sem chamar o remetente', async () => {
    await definirTotalHoje(1);
    const trava: pg.Client = await outraConexao(aberto.url);
    try {
      await trava.query('BEGIN');
      await trava.query(`UPDATE envios_email_dia SET total = total WHERE dia = ${HOJE}`);
      const remetente = remetenteMemoria();
      const inicio = Date.now();
      expect(await enviarConfirmando(remetente, pedido())).toBe('indisponivel');
      expect(Date.now() - inicio).toBeGreaterThanOrEqual(1900);
      expect(remetente.mensagens).toEqual([]);
    } finally {
      await trava.query('ROLLBACK').catch(() => undefined);
      await trava.end();
    }
    expect(await totalHoje()).toBe(1);
  });
});

describe('registrarOrigem', () => {
  it('ACE-73: 21 pedidos da mesma origem /48 em 1 h: os 20 primeiros passam e o 21.º é recusado', async () => {
    const { fabrica } = fabricaComoApp();
    const resultados: boolean[] = [];
    for (let i = 0; i < 21; i += 1) {
      // Endereços diferentes do mesmo /48 (2001:db8:1::/48).
      resultados.push(
        await registrarOrigem(aberto.url, `2001:db8:1:${(i + 1).toString(16)}::1`, { fabrica }),
      );
    }
    expect(resultados.slice(0, 20).every(Boolean)).toBe(true);
    expect(resultados[20]).toBe(false);
  });

  it('ACE-73: IPv4 conta pelo endereço inteiro; outra origem não é afetada', async () => {
    const { fabrica } = fabricaComoApp();
    for (let i = 0; i < 20; i += 1) await registrarOrigem(aberto.url, '203.0.113.7', { fabrica });
    expect(await registrarOrigem(aberto.url, '203.0.113.7', { fabrica })).toBe(false);
    expect(await registrarOrigem(aberto.url, '203.0.113.8', { fabrica })).toBe(true);
  });

  it('ACE-73: o registro fica gravado mesmo que a transação da rota seja desfeita depois', async () => {
    const { fabrica } = fabricaComoApp();
    await comDb(aberto.url, null, async () => {
      await registrarOrigem(aberto.url, '198.51.100.1', { fabrica });
    });
    const r = await aberto.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pedidos_email_origem',
    );
    expect(r.rows[0]?.n).toBe(1);
  });
});
