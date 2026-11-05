import type { MensagemCobranca } from '@pelada/contrato/fila-avisos';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ATRASO_AVISO_COBRANCA_S,
  criarAvisarCobranca,
  idempotenciaDoAviso,
  type RelatoDesistencia,
} from '../../../src/aplicacao/notificacoes/avisar-cobranca.ts';
import type { Env } from '../../../src/entrada/ambiente.ts';
import { bancoSemContexto, type AbrirBanco } from '../../../src/entrada/consumidor-avisos.ts';
import { remetenteMemoria, type RemetenteMemoria } from '../../../src/infraestrutura/email/resend.ts';
import { filaMemoria, type FilaMemoria } from '../../../src/infraestrutura/fila/avisos.ts';
import { envCom, fabricaComoApp } from '../../db/requisicao.ts';
import { abrirCenario, type CenarioAberto } from '../../isolamento/apoio.ts';

/**
 * Aviso de cobrança por e-mail (notificacoes T24; NOT-38, NOT-39, NOT-41, NOT-42, NOT-47), contra um banco `teste_*`
 * migrado, como `pelada_app` sem conta e sem slug, com o remetente em memória (NOT-63) e a fila em memória.
 *
 * Casos limite: mesma mensagem duas vezes em série e em paralelo; Resend falha 1, 2 e 3 vezes; cota cheia; criadora
 * excluída; grupo Free. O `beforeEach` zera o contador de e-mails do dia e o registro dos avisos.
 */

const URL_PUBLICA = 'https://app.exemplo.test';
const LIMITE = 100;

let aberto: CenarioAberto;
let env: Env;
let banco: AbrirBanco;
let fila: FilaMemoria;
let remetente: RemetenteMemoria;
let relatos: RelatoDesistencia[];
let emailCriadora: string;
let sequencia = 0;

function mensagem(extra: Partial<MensagemCobranca> = {}): MensagemCobranca {
  sequencia += 1;
  return {
    tipo: 'cobranca',
    idExterno: `pay_t24_${sequencia}`,
    aviso: 'pagamento_atrasado',
    grupoId: aberto.cenario.grupoA,
    valorCentavos: 990,
    vencimento: '2026-11-10',
    tentativa: 1,
    ...extra,
  };
}

function avisar(m: MensagemCobranca) {
  return criarAvisarCobranca({ remetente, reportar: (r) => relatos.push(r) })(m, { env, banco });
}

async function totalDoDia(): Promise<number> {
  const r = await aberto.db.query<{ total: number }>(
    `SELECT total FROM envios_email_dia WHERE dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
  );
  return r.rows[0]?.total ?? 0;
}

async function gastarCota(total: number): Promise<void> {
  await aberto.db.query(
    `INSERT INTO envios_email_dia (dia, total) VALUES ((now() AT TIME ZONE 'America/Sao_Paulo')::date, $1)
     ON CONFLICT (dia) DO UPDATE SET total = EXCLUDED.total`,
    [total],
  );
}

async function avisosRegistrados(): Promise<number> {
  const r = await aberto.db.query<{ n: number }>('SELECT count(*)::int AS n FROM avisos_cobranca');
  return r.rows[0]?.n ?? 0;
}

beforeAll(async () => {
  aberto = await abrirCenario();
  fila = filaMemoria();
  env = { ...envCom(aberto.url), URL_PUBLICA, LIMITE_EMAILS_DIA: String(LIMITE), FILA_AVISOS: fila } as Env;
  banco = bancoSemContexto(env, fabricaComoApp().fabrica);
  const r = await aberto.db.query<{ email: string }>('SELECT email FROM contas WHERE id = $1', [aberto.cenario.contaA]);
  emailCriadora = r.rows[0]?.email ?? '';
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await aberto.db.query('DELETE FROM envios_email_dia');
  await aberto.db.query('DELETE FROM avisos_cobranca');
  await aberto.db.query(`UPDATE grupos SET situacao_comercial = 'ativo', trial_inicio = NULL WHERE id = $1`, [
    aberto.cenario.grupoA,
  ]);
  fila.enviadas.length = 0;
  remetente = remetenteMemoria();
  relatos = [];
});

describe('avisarCobranca', () => {
  it('NOT-38: o e-mail vai só ao endereço da criadora, com a chave de idempotência do evento', async () => {
    const m = mensagem();
    await expect(avisar(m)).resolves.toEqual({ acao: 'concluir' });
    expect(remetente.mensagens).toHaveLength(1);
    const [email] = remetente.mensagens;
    expect(email?.para).toBe(emailCriadora);
    expect(email?.tipo).toBe('aviso_cobranca');
    expect(email?.idempotencia).toBe(idempotenciaDoAviso(m));
    expect(email?.texto).toContain(`${URL_PUBLICA}/app/grupos/${aberto.cenario.grupoA}/plano`);
    expect(await avisosRegistrados()).toBe(1);
  });

  it('NOT-38: o grupo B manda à criadora do B, nunca à do A', async () => {
    const r = await aberto.db.query<{ email: string }>('SELECT email FROM contas WHERE id = $1', [aberto.cenario.contaB]);
    await avisar(mensagem({ grupoId: aberto.cenario.grupoB }));
    expect(remetente.mensagens.map((e) => e.para)).toEqual([r.rows[0]?.email]);
  });

  it('NOT-39: pagamento_atrasado injetado duas vezes em série gera um e-mail', async () => {
    const m = mensagem();
    await avisar(m);
    await avisar({ ...m });
    expect(remetente.mensagens).toHaveLength(1);
    expect(await totalDoDia()).toBe(1);
  });

  it('NOT-39: a mesma mensagem em paralelo gera um e-mail', async () => {
    const m = mensagem();
    await Promise.all([avisar(m), avisar({ ...m })]);
    expect(remetente.mensagens).toHaveLength(1);
    expect(await avisosRegistrados()).toBe(1);
  });

  it('NOT-39, AD-105: pagamento_confirmado e pagamento_atrasado da mesma cobrança são dois avisos', async () => {
    const m = mensagem({ aviso: 'pagamento_confirmado' });
    await avisar(m);
    await avisar({ ...m, aviso: 'pagamento_atrasado' });
    expect(remetente.mensagens).toHaveLength(2);
  });

  it('NOT-41: com 80% da cota gasta, o aviso sai e a cota conta o envio', async () => {
    await gastarCota(80);
    await avisar(mensagem());
    expect(remetente.mensagens).toHaveLength(1);
    expect(await totalDoDia()).toBe(81);
  });

  it('NOT-41: cota cheia (100%): não envia, volta à fila com 8 h e nada fica registrado', async () => {
    await gastarCota(LIMITE);
    const m = mensagem();
    await avisar(m);
    expect(remetente.mensagens).toHaveLength(0);
    expect(fila.enviadas).toEqual([{ corpo: { ...m, tentativa: 2 }, delaySeconds: ATRASO_AVISO_COBRANCA_S }]);
    expect(await avisosRegistrados()).toBe(0);
    expect(await totalDoDia()).toBe(LIMITE);
  });

  it('NOT-42: com o remetente falhando, o aviso volta à fila com 8 h, a cota não é gasta e na 3.ª falha desiste', async () => {
    remetente.falharProximos(3);
    const m = mensagem();

    await avisar(m);
    expect(await totalDoDia()).toBe(0);
    expect(await avisosRegistrados()).toBe(0);
    const segunda = fila.enviadas.shift();
    expect(segunda).toEqual({ corpo: { ...m, tentativa: 2 }, delaySeconds: ATRASO_AVISO_COBRANCA_S });

    await avisar(segunda?.corpo as MensagemCobranca);
    const terceira = fila.enviadas.shift();
    expect(terceira).toEqual({ corpo: { ...m, tentativa: 3 }, delaySeconds: ATRASO_AVISO_COBRANCA_S });
    expect(relatos).toEqual([]);

    await avisar(terceira?.corpo as MensagemCobranca);
    expect(fila.enviadas).toEqual([]);
    expect(remetente.mensagens).toHaveLength(0);
    expect(await totalDoDia()).toBe(0);
    // O Sentry recebe só a desistência e o tipo: nem e-mail, nem nome, nem valor, nem id da cobrança.
    expect(relatos).toEqual([{ motivo: 'desistencia', tipo: 'pagamento_atrasado' }]);
    const texto = JSON.stringify(relatos);
    for (const proibido of [emailCriadora, m.idExterno, '990', 'Grupo A']) expect(texto).not.toContain(proibido);
  });

  it('NOT-42: falhou uma vez e a nova tentativa envia, uma vez só', async () => {
    remetente.falharProximos(1);
    const m = mensagem();
    await avisar(m);
    const nova = fila.enviadas.shift();
    await avisar(nova?.corpo as MensagemCobranca);
    expect(remetente.mensagens).toHaveLength(1);
    expect(await totalDoDia()).toBe(1);
    expect(fila.enviadas).toEqual([]);
  });

  it('NOT-47: grupo Free também recebe o aviso', async () => {
    await aberto.db.query(`UPDATE grupos SET situacao_comercial = 'inadimplente' WHERE id = $1`, [aberto.cenario.grupoA]);
    await avisar(mensagem());
    expect(remetente.mensagens).toHaveLength(1);
  });

  it('NOT-38: criadora excluída: nenhum e-mail', async () => {
    const { contaA } = aberto.cenario;
    await aberto.db.query('UPDATE contas SET excluida_em = now() WHERE id = $1', [contaA]);
    try {
      await avisar(mensagem());
      expect(remetente.mensagens).toHaveLength(0);
      expect(fila.enviadas).toEqual([]);
    } finally {
      await aberto.db.query('UPDATE contas SET excluida_em = NULL WHERE id = $1', [contaA]);
    }
  });
});
