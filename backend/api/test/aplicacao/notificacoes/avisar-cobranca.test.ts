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
import { servicoPushFalso, TTL_COBRANCA, type ServicoPushFalso } from '../../../src/infraestrutura/push/enviar.ts';
import { topicoDoGrupo } from '../../../src/infraestrutura/push/topico.ts';
import { assinanteDeTeste, chavesVapidDeTeste, decifrarPush, type AssinanteDeTeste } from '../../apoio/push.ts';
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

describe('avisarCobranca: push à criadora (T25)', () => {
  let envPush: Env;
  let servico: ServicoPushFalso;

  beforeAll(async () => {
    const v = await chavesVapidDeTeste();
    envPush = { ...env, VAPID_PUBLICA: v.publica, VAPID_PRIVADA: v.privada, VAPID_ASSUNTO: v.assunto } as Env;
  });

  beforeEach(async () => {
    servico = servicoPushFalso();
    await aberto.db.query('DELETE FROM push_conta WHERE conta_id = $1', [aberto.cenario.contaA]);
  });

  /** Assinaturas de push da criadora (conta A), como superusuário, em ordem de id. */
  async function assinar(n: number): Promise<Array<AssinanteDeTeste & { id: string; endpoint: string }>> {
    const lista: Array<AssinanteDeTeste & { id: string; endpoint: string }> = [];
    for (let i = 1; i <= n; i += 1) {
      const a = await assinanteDeTeste();
      const endpoint = `https://fcm.googleapis.com/fcm/send/t25-${i}`;
      const r = await aberto.db.query<{ id: string }>(
        'INSERT INTO push_conta (conta_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4) RETURNING id::text',
        [aberto.cenario.contaA, endpoint, a.p256dh, a.auth],
      );
      lista.push({ ...a, id: r.rows[0]?.id ?? '', endpoint });
    }
    return lista;
  }

  async function linhasDaConta(): Promise<Array<{ endpoint: string; enviado: boolean }>> {
    const r = await aberto.db.query<{ endpoint: string; enviado: boolean }>(
      'SELECT endpoint, ultimo_envio_em IS NOT NULL AS enviado FROM push_conta WHERE conta_id = $1 ORDER BY id',
      [aberto.cenario.contaA],
    );
    return r.rows;
  }

  function avisarComPush(m: MensagemCobranca, comEnv: Env = envPush) {
    const b = bancoSemContexto(comEnv, fabricaComoApp().fabrica);
    return criarAvisarCobranca({
      remetente,
      reportar: (r) => relatos.push(r),
      fetch: servico.fetch,
      reportarPush: () => undefined,
    })(m, { env: comEnv, banco: b });
  }

  it('NOT-46: sem assinatura, um e-mail e nenhum fetch', async () => {
    await avisarComPush(mensagem());
    expect(remetente.mensagens).toHaveLength(1);
    expect(servico.pedidos).toHaveLength(0);
  });

  it('NOT-61: com assinatura e sem VAPID, só o e-mail', async () => {
    await assinar(1);
    await avisarComPush(mensagem(), env);
    expect(remetente.mensagens).toHaveLength(1);
    expect(servico.pedidos).toHaveLength(0);
  });

  it('NOT-48: com 2 assinaturas, 2 envios cifrados com VAPID e TTL de 48 h; 410 apaga a assinatura', async () => {
    const [um, dois] = await assinar(2);
    servico.responder(201, 410);
    await avisarComPush(mensagem());

    expect(servico.pedidos.map((p) => p.url)).toEqual([um?.endpoint, dois?.endpoint]);
    for (const pedido of servico.pedidos) {
      expect(pedido.cabecalhos.get('content-encoding')).toBe('aes128gcm');
      expect(pedido.cabecalhos.get('authorization')).toMatch(/^vapid t=.+, k=.+$/);
      expect(pedido.cabecalhos.get('ttl')).toBe(String(TTL_COBRANCA));
      expect(pedido.cabecalhos.get('topic')).toBe(await topicoDoGrupo(aberto.cenario.grupoA));
    }
    expect(await linhasDaConta()).toEqual([{ endpoint: um?.endpoint, enviado: true }]);
  });

  it('NOT-43: o payload enviado tem só o título e o caminho de Meu plano, sem valor, e-mail nem nome', async () => {
    const [um] = await assinar(1);
    const nome = (await aberto.db.query<{ nome: string }>('SELECT nome FROM contas WHERE id = $1', [aberto.cenario.contaA]))
      .rows[0]?.nome;
    await avisarComPush(mensagem({ valorCentavos: 12345 }));
    const [pedido] = servico.pedidos;
    const texto = await decifrarPush(pedido?.corpo ?? new Uint8Array(), um as AssinanteDeTeste);
    expect(JSON.parse(texto)).toEqual({
      titulo: 'Pagamento atrasado: Grupo A',
      caminho: `/app/grupos/${aberto.cenario.grupoA}/plano`,
    });
    for (const proibido of ['12345', '123,45', 'R$', emailCriadora, nome ?? '']) expect(texto).not.toContain(proibido);
  });

  it('NOT-48: 503 volta à fila só com o push: a nova tentativa não manda outro e-mail', async () => {
    const [um, dois] = await assinar(2);
    servico.responder(201, 503);
    const m = mensagem();
    await avisarComPush(m);

    const nova = fila.enviadas.shift();
    expect(nova).toEqual({ corpo: { ...m, pushIds: [dois?.id], tentativa: 2 }, delaySeconds: 60 });

    await avisarComPush(nova?.corpo as MensagemCobranca);
    expect(remetente.mensagens).toHaveLength(1);
    expect(servico.pedidos.map((p) => p.url)).toEqual([um?.endpoint, dois?.endpoint, dois?.endpoint]);
    expect((await linhasDaConta()).every((l) => l.enviado)).toBe(true);
    expect(fila.enviadas).toEqual([]);
  });

  it('NOT-48: o push que segue em 503 desiste na 3.ª tentativa e mantém a assinatura', async () => {
    await assinar(1);
    servico.responder(503, 503, 503);
    await avisarComPush(mensagem());
    await avisarComPush(fila.enviadas.shift()?.corpo as MensagemCobranca);
    const terceira = fila.enviadas.shift()?.corpo as MensagemCobranca;
    expect(terceira.tentativa).toBe(3);
    await avisarComPush(terceira);
    expect(servico.pedidos).toHaveLength(3);
    expect(fila.enviadas).toEqual([]);
    expect(await linhasDaConta()).toHaveLength(1);
  });

  it('NOT-42: e-mail que falha não manda push', async () => {
    await assinar(1);
    remetente.falharProximos(1);
    await avisarComPush(mensagem());
    expect(servico.pedidos).toHaveLength(0);
  });

  it('NOT-39: a mesma mensagem duas vezes manda um push por aparelho', async () => {
    await assinar(1);
    const m = mensagem();
    await avisarComPush(m);
    await avisarComPush({ ...m });
    expect(servico.pedidos).toHaveLength(1);
  });
});
