import { paraBase64url } from '@pelada/contrato/push';
import type { MensagemRanking } from '@pelada/contrato/fila-avisos';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATRASO_PADRAO_S,
  ATRASO_TETO_S,
  criarEnviarRanking,
} from '../../../src/aplicacao/notificacoes/enviar-ranking.ts';
import type { Env } from '../../../src/entrada/ambiente.ts';
import { bancoSemContexto, type AbrirBanco } from '../../../src/entrada/consumidor-avisos.ts';
import { filaMemoria, type FilaMemoria } from '../../../src/infraestrutura/fila/avisos.ts';
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

describe('enviarRanking: retentativa e retomada (T19)', () => {
  let fila: FilaMemoria;
  let env: Env;

  beforeEach(() => {
    fila = filaMemoria();
    env = { ...envBase, FILA_AVISOS: fila };
  });

  /** Ids das assinaturas do grupo A, em ordem. */
  async function idsDoGrupo(): Promise<string[]> {
    const r = await aberto.db.query<{ id: string }>('SELECT id::text FROM push_ranking WHERE grupo_id = $1 ORDER BY id', [
      aberto.cenario.grupoA,
    ]);
    return r.rows.map((l) => l.id);
  }

  /** A próxima mensagem da fila, já como ranking. */
  function proxima(): { corpo: MensagemRanking; delaySeconds?: number } {
    const item = fila.enviadas.shift();
    if (item === undefined || item.corpo.tipo !== 'ranking') throw new Error('Nenhuma mensagem de ranking na fila.');
    return { corpo: item.corpo, ...(item.delaySeconds === undefined ? {} : { delaySeconds: item.delaySeconds }) };
  }

  it('NOT-34: 41 assinaturas: 40 agora e a continuação a partir do id da 40.ª, que manda só a 41.ª', async () => {
    await assinaturas(41);
    const ids = await idsDoGrupo();
    const aviso = mensagem();
    await enviar(aviso, env);
    expect(servico.pedidos).toHaveLength(40);
    const continuacao = proxima();
    expect(continuacao.corpo).toEqual({ ...aviso, aposId: ids[39] });
    expect(continuacao.delaySeconds).toBeUndefined();

    await enviar(continuacao.corpo, env);
    expect(servico.pedidos).toHaveLength(41);
    expect(servico.pedidos[40]?.url).toBe(ENDPOINT(41));
    expect(fila.enviadas).toEqual([]);
  });

  it('NOT-34: 80 assinaturas: duas invocações e nenhuma continuação vazia', async () => {
    await assinaturas(80);
    await enviar(mensagem(), env);
    await enviar(proxima().corpo, env);
    expect(servico.pedidos).toHaveLength(80);
    expect(new Set(servico.pedidos.map((p) => p.url)).size).toBe(80);
    expect(fila.enviadas).toEqual([]);
    expect((await linhas()).every((l) => l.enviado)).toBe(true);
  });

  it('NOT-31: 429 com Retry-After 120 vai numa mensagem só com o id, tentativa 2 e atraso de 120 s', async () => {
    await assinaturas(3);
    const ids = await idsDoGrupo();
    servico.responder(201, { status: 429, cabecalhos: { 'retry-after': '120' } }, 201);
    const aviso = mensagem();
    await enviar(aviso, env);
    const nova = proxima();
    expect(nova.corpo).toEqual({ ...aviso, aposId: '0', ids: [ids[1]], tentativa: 2 });
    expect(nova.delaySeconds).toBe(120);
    expect(await linhas()).toEqual([
      { endpoint: ENDPOINT(1), enviado: true },
      { endpoint: ENDPOINT(2), enviado: false },
      { endpoint: ENDPOINT(3), enviado: true },
    ]);

    // A nova tentativa manda só à que ficou pendente.
    await enviar(nova.corpo, env);
    expect(servico.pedidos.map((p) => p.url)).toEqual([ENDPOINT(1), ENDPOINT(2), ENDPOINT(3), ENDPOINT(2)]);
    expect((await linhas()).every((l) => l.enviado)).toBe(true);
    expect(fila.enviadas).toEqual([]);
  });

  it('NOT-31: 503 recebe 2 novas tentativas e depois desiste, sem apagar a assinatura; sem Retry-After, 60 s', async () => {
    await assinaturas(1);
    servico.responder(503, 503, 503);
    await enviar(mensagem(), env);
    const segunda = proxima();
    expect([segunda.corpo.tentativa, segunda.delaySeconds]).toEqual([2, ATRASO_PADRAO_S]);
    await enviar(segunda.corpo, env);
    const terceira = proxima();
    expect(terceira.corpo.tentativa).toBe(3);
    await enviar(terceira.corpo, env);

    expect(servico.pedidos).toHaveLength(3);
    expect(fila.enviadas).toEqual([]);
    expect(await linhas()).toEqual([{ endpoint: ENDPOINT(1), enviado: false }]);
  });

  it('NOT-31: o atraso é o maior Retry-After do lote, com teto de 1 h', async () => {
    await assinaturas(3);
    servico.responder(
      { status: 429, cabecalhos: { 'retry-after': '30' } },
      { status: 503, cabecalhos: { 'retry-after': '7200' } },
      503,
    );
    await enviar(mensagem(), env);
    const nova = proxima();
    expect(nova.corpo.ids).toHaveLength(3);
    expect(nova.delaySeconds).toBe(ATRASO_TETO_S);
  });

  it('NOT-69: queda depois de 10 aceitas; a mensagem refeita pela fila envia só as 30 restantes', async () => {
    await assinaturas(40);
    const aviso = mensagem();
    servico.responder(...Array.from({ length: 10 }, () => 201), 400);
    const cai = criarEnviarRanking({
      fetch: servico.fetch,
      reportar: () => {
        throw new Error('queda no meio do lote');
      },
    });
    await expect(cai(aviso, { env, banco })).rejects.toThrow('queda no meio do lote');
    expect((await linhas()).filter((l) => l.enviado)).toHaveLength(10);

    const antes = servico.pedidos.length;
    await enviar(aviso, env); // a fila entrega a mesma mensagem de novo (retry do consumidor)
    const refeitos = servico.pedidos.slice(antes).map((p) => p.url);
    expect(refeitos).toHaveLength(30);
    expect(refeitos).toEqual(Array.from({ length: 30 }, (_, i) => ENDPOINT(i + 11)));
    expect((await linhas()).every((l) => l.enviado)).toBe(true);
  });
});
