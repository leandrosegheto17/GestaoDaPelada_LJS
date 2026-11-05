import { paraBase64url } from '@pelada/contrato/push';
import type { MensagemRanking } from '@pelada/contrato/fila-avisos';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEnviarRanking } from '../../../src/aplicacao/notificacoes/enviar-ranking.ts';
import type { Env } from '../../../src/entrada/ambiente.ts';
import { bancoSemContexto, type AbrirBanco } from '../../../src/entrada/consumidor-avisos.ts';
import { servicoPushFalso, TTL_RANKING, type ServicoPushFalso } from '../../../src/infraestrutura/push/enviar.ts';
import { topicoDoGrupo } from '../../../src/infraestrutura/push/topico.ts';
import { envCom, fabricaComoApp } from '../../db/requisicao.ts';
import { abrirCenario, type CenarioAberto } from '../../isolamento/apoio.ts';

/**
 * Envio do ranking (notificacoes T18; NOT-24, NOT-29, NOT-30, NOT-61, NOT-68), contra um banco `teste_*` migrado, como
 * `pelada_app` sem conta e sem slug (o consumidor da fila), com o serviço de push falso (NOT-63).
 *
 * Casos limite: Pro, trial, Free, arquivado, grupo que caiu para Free depois do commit, sem VAPID, uma assinatura 410
 * entre 3. O plano do grupo A é trocado como superusuário antes de cada caso; as assinaturas do grupo A são recriadas
 * no `beforeEach`, com chaves P-256 de verdade (a cifra precisa delas).
 */

let aberto: CenarioAberto;
let envBase: Env;
let banco: AbrirBanco;
let servico: ServicoPushFalso;

const HOJE_SP = `(now() AT TIME ZONE 'America/Sao_Paulo')::date`;

async function chavesVapid(): Promise<Pick<Env, 'VAPID_PUBLICA' | 'VAPID_PRIVADA' | 'VAPID_ASSUNTO'>> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', par.privateKey)) as JsonWebKey;
  const publica = new Uint8Array((await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer);
  return { VAPID_PUBLICA: paraBase64url(publica), VAPID_PRIVADA: jwk.d ?? '', VAPID_ASSUNTO: 'mailto:avisos@exemplo.com' };
}

async function chavesAssinante(): Promise<{ p256dh: string; auth: string }> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const publica = new Uint8Array((await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer);
  return { p256dh: paraBase64url(publica), auth: paraBase64url(crypto.getRandomValues(new Uint8Array(16))) };
}

const ENDPOINT = (i: number) => `https://fcm.googleapis.com/fcm/send/t18-${i}`;

/** Recria `n` assinaturas do grupo A (como superusuário) e devolve os endpoints em ordem de id. */
async function assinaturas(n: number): Promise<string[]> {
  const { db, cenario } = aberto;
  await db.query('DELETE FROM push_ranking WHERE grupo_id = $1', [cenario.grupoA]);
  const endpoints: string[] = [];
  for (let i = 1; i <= n; i += 1) {
    const { p256dh, auth } = await chavesAssinante();
    await db.query('INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)', [
      cenario.grupoA,
      ENDPOINT(i),
      p256dh,
      auth,
    ]);
    endpoints.push(ENDPOINT(i));
  }
  return endpoints;
}

async function linhas(): Promise<Array<{ endpoint: string; enviado: boolean }>> {
  const r = await aberto.db.query<{ endpoint: string; enviado: boolean }>(
    'SELECT endpoint, ultimo_envio_em IS NOT NULL AS enviado FROM push_ranking WHERE grupo_id = $1 ORDER BY id',
    [aberto.cenario.grupoA],
  );
  return r.rows;
}

type Situacao = 'uso_proprio' | 'trial' | 'ativo' | 'inadimplente' | 'cancelado';

/** Plano do grupo A: situação e, no trial, o início `diasAtras` dias antes de hoje (São Paulo). */
async function plano(situacao: Situacao, opcoes: { diasAtras?: number; arquivado?: boolean } = {}): Promise<void> {
  await aberto.db.query(
    `UPDATE grupos
        SET situacao_comercial = $2,
            trial_inicio = CASE WHEN $2 = 'trial' THEN ${HOJE_SP} - $3::integer ELSE NULL END,
            arquivado_em = CASE WHEN $4 THEN now() ELSE NULL END
      WHERE id = $1`,
    [aberto.cenario.grupoA, situacao, opcoes.diasAtras ?? 0, opcoes.arquivado ?? false],
  );
}

function mensagem(): MensagemRanking {
  return {
    tipo: 'ranking',
    grupoId: aberto.cenario.grupoA,
    dataPartida: '2026-11-05',
    criadoEm: new Date().toISOString(),
    aposId: '0',
    tentativa: 1,
  };
}

function enviar(m: MensagemRanking, env: Env = envBase, abrir: AbrirBanco = banco) {
  return criarEnviarRanking({ fetch: servico.fetch, reportar: () => undefined })(m, { env, banco: abrir });
}

beforeAll(async () => {
  aberto = await abrirCenario();
  envBase = { ...envCom(aberto.url), ...(await chavesVapid()) };
  banco = bancoSemContexto(envBase, fabricaComoApp().fabrica);
});

afterAll(async () => {
  // O banco `teste_*` inteiro sai no `fechar()`, com as linhas `t18-*`.
  await aberto?.fechar();
});

beforeEach(async () => {
  servico = servicoPushFalso();
  await plano('ativo');
});

describe('enviarRanking', () => {
  it('NOT-29, NOT-30: 3 assinaturas, uma responde 410: 2 com ultimo_envio_em, a terceira some do banco', async () => {
    const [um, dois, tres] = await assinaturas(3);
    servico.responder(201, 410, 201);

    await expect(enviar(mensagem())).resolves.toEqual({ acao: 'concluir' });

    expect(servico.pedidos.map((p) => p.url)).toEqual([um, dois, tres]);
    expect(await linhas()).toEqual([
      { endpoint: um, enviado: true },
      { endpoint: tres, enviado: true },
    ]);
  });

  it('NOT-27, NOT-28: cada pedido leva TTL do ranking, Topic do grupo, VAPID e corpo cifrado sem o nome do grupo', async () => {
    await assinaturas(1);
    await enviar(mensagem());
    const [pedido] = servico.pedidos;
    expect(pedido?.cabecalhos.get('ttl')).toBe(String(TTL_RANKING));
    expect(pedido?.cabecalhos.get('topic')).toBe(await topicoDoGrupo(aberto.cenario.grupoA));
    expect(pedido?.cabecalhos.get('content-encoding')).toBe('aes128gcm');
    expect(pedido?.cabecalhos.get('authorization')).toMatch(/^vapid t=.+, k=.+$/);
    expect(new TextDecoder().decode(pedido?.corpo)).not.toContain('Grupo A');
  });

  it('NOT-24: trial vigente envia; trial vencido (14 dias) é Free e não chama o serviço', async () => {
    await assinaturas(1);
    await plano('trial', { diasAtras: 13 });
    await enviar(mensagem());
    expect(servico.pedidos).toHaveLength(1);

    await assinaturas(1);
    servico = servicoPushFalso();
    await plano('trial', { diasAtras: 14 });
    await enviar(mensagem());
    expect(servico.pedidos).toHaveLength(0);
    expect(await linhas()).toEqual([{ endpoint: ENDPOINT(1), enviado: false }]);
  });

  it('NOT-24: cortesia (uso próprio) envia; Free (inadimplente) não chama o serviço', async () => {
    await assinaturas(1);
    await plano('uso_proprio');
    await enviar(mensagem());
    expect(servico.pedidos).toHaveLength(1);

    await assinaturas(2);
    servico = servicoPushFalso();
    await plano('inadimplente');
    await expect(enviar(mensagem())).resolves.toEqual({ acao: 'concluir' });
    expect(servico.pedidos).toHaveLength(0);
    expect((await linhas()).every((l) => !l.enviado)).toBe(true);
  });

  it('NOT-24: grupo arquivado, mesmo Pro, não chama o serviço', async () => {
    await assinaturas(2);
    await plano('ativo', { arquivado: true });
    await enviar(mensagem());
    expect(servico.pedidos).toHaveLength(0);
  });

  it('NOT-68: grupo Pro no commit que cai para Free antes do envio não chama o serviço', async () => {
    await assinaturas(2);
    const aviso = mensagem(); // enfileirada com o grupo Pro
    await plano('inadimplente'); // o webhook derrubou o plano antes de a fila entregar
    await enviar(aviso);
    expect(servico.pedidos).toHaveLength(0);
  });

  it('NOT-61: sem as variáveis VAPID, nenhum fetch e o banco nem é aberto', async () => {
    await assinaturas(2);
    const abrir = vi.fn(banco) as unknown as AbrirBanco;
    const semVapid = { ...envBase, VAPID_PUBLICA: undefined, VAPID_PRIVADA: '', VAPID_ASSUNTO: undefined } as Env;
    await expect(enviar(mensagem(), semVapid, abrir)).resolves.toEqual({ acao: 'concluir' });
    expect(servico.pedidos).toHaveLength(0);
    expect(abrir).not.toHaveBeenCalled();
  });

  it('NOT-69: a mesma mensagem entregue de novo depois do sucesso não reenvia às já aceitas', async () => {
    await assinaturas(2);
    const aviso = mensagem();
    await enviar(aviso);
    expect(servico.pedidos).toHaveLength(2);
    await enviar(aviso);
    expect(servico.pedidos).toHaveLength(2);
  });

  it('NOT-69: queda no meio do lote grava as já aceitas antes de a exceção subir', async () => {
    const [um, dois] = await assinaturas(2);
    // A primeira é aceita; a segunda responde 400 e o relato lança: a exceção sai do meio do laço, como uma queda.
    servico.responder(201, 400);
    const caso = criarEnviarRanking({
      fetch: servico.fetch,
      reportar: () => {
        throw new Error('queda no meio do lote');
      },
    });
    await expect(caso(mensagem(), { env: envBase, banco })).rejects.toThrow('queda no meio do lote');
    expect(await linhas()).toEqual([
      { endpoint: um, enviado: true },
      { endpoint: dois, enviado: false },
    ]);
  });
});
