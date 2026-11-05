import { paraBase64url } from '@pelada/contrato/push';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarEnviarRanking } from '../../../src/aplicacao/notificacoes/enviar-ranking.ts';
import type { Env } from '../../../src/entrada/ambiente.ts';
import type { AbrirBanco } from '../../../src/entrada/consumidor-avisos.ts';
import { push, type AssinaturaDoLote } from '../../../src/infraestrutura/db/repositorios/push.ts';
import type { Db } from '../../../src/infraestrutura/db/repositorios/tipos.ts';
import { filaMemoria, type FilaMemoria } from '../../../src/infraestrutura/fila/avisos.ts';
import { servicoPushFalso } from '../../../src/infraestrutura/push/enviar.ts';

/**
 * Limites da plataforma numa invocação do consumidor (notificacoes T20; NOT-34; AD-112), no `workerd`. Conta cada
 * subrequisição: os `fetch` ao serviço de push (falso), cada abertura de banco (uma conexão do Hyperdrive), cada envio
 * à fila e cada relato ao Sentry. O banco é simulado pelo repositório (`push.*`), porque o que se mede aqui é quantas
 * vezes o caso de uso o abre, não o SQL (provado na T10 e na T18).
 */

const GRUPO = '6f1c2a54-2b1e-4c7a-9a43-0d8f3b1e5c21';
const TETO_SUBREQUISICOES = 50;

async function vapid(): Promise<Pick<Env, 'VAPID_PUBLICA' | 'VAPID_PRIVADA' | 'VAPID_ASSUNTO'>> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', par.privateKey)) as JsonWebKey;
  const publica = new Uint8Array(
    (await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer,
  );
  return {
    VAPID_PUBLICA: paraBase64url(publica),
    VAPID_PRIVADA: jwk.d ?? '',
    VAPID_ASSUNTO: 'mailto:avisos@exemplo.com',
  };
}

async function assinaturas(n: number): Promise<AssinaturaDoLote[]> {
  const lista: AssinaturaDoLote[] = [];
  for (let i = 1; i <= n; i += 1) {
    const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const publica = new Uint8Array(
      (await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer,
    );
    lista.push({
      id: String(i),
      endpoint: `https://fcm.googleapis.com/fcm/send/t20-${i}`,
      p256dh: paraBase64url(publica),
      auth: paraBase64url(crypto.getRandomValues(new Uint8Array(16))),
    });
  }
  return lista;
}

/** Repositório simulado sobre uma lista fixa, com o mesmo contrato de `aposId` e `limite` da `push_ranking_lote`. */
function simularRepositorio(todas: AssinaturaDoLote[]): void {
  vi.spyOn(push, 'envioGrupo').mockResolvedValue({
    nome: 'Grupo dos Limites',
    slug: 'grupo-dos-limites',
    arquivado: false,
    situacaoComercial: 'ativo',
    trialInicio: null,
    pagoAte: null,
  });
  vi.spyOn(push, 'loteRanking').mockImplementation(async (_db, _grupo, aposId, limite) =>
    todas.filter((a) => BigInt(a.id) > BigInt(aposId)).slice(0, limite),
  );
  vi.spyOn(push, 'resultadoRanking').mockResolvedValue(undefined);
}

interface Contagem {
  fetchPush: number;
  bancos: number;
  fila: number;
  sentry: number;
  total(): number;
}

async function invocar(
  n: number,
  respostas: number[] = [],
): Promise<{ contagem: Contagem; fila: FilaMemoria }> {
  const todas = await assinaturas(n);
  simularRepositorio(todas);
  const servico = servicoPushFalso();
  servico.responder(...respostas);
  const fila = filaMemoria();
  const contagem: Contagem = {
    fetchPush: 0,
    bancos: 0,
    fila: 0,
    sentry: 0,
    total() {
      return this.fetchPush + this.bancos + this.fila + this.sentry;
    },
  };
  const contarFetch: typeof fetch = (entrada, init) => {
    contagem.fetchPush += 1;
    return servico.fetch(entrada, init);
  };
  const banco: AbrirBanco = async (fn) => {
    contagem.bancos += 1;
    return fn({} as Db);
  };
  const env = {
    ...(await vapid()),
    FILA_AVISOS: {
      send: async (
        corpo: Parameters<FilaMemoria['send']>[0],
        opcoes?: Parameters<FilaMemoria['send']>[1],
      ) => {
        contagem.fila += 1;
        await fila.send(corpo, opcoes);
      },
    },
  } as unknown as Env;
  const caso = criarEnviarRanking({
    fetch: contarFetch,
    reportar: () => {
      contagem.sentry += 1;
    },
  });
  await caso(
    {
      tipo: 'ranking',
      grupoId: GRUPO,
      dataPartida: '2026-11-05',
      criadoEm: '2026-11-05T12:00:00.000Z',
      aposId: '0',
      tentativa: 1,
    },
    { env, banco },
  );
  return { contagem, fila };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('limites de uma invocação com 40 assinaturas', () => {
  it('NOT-34: 40 assinaturas geram 40 fetch de push e no máximo 50 subrequisições', async () => {
    const { contagem, fila } = await invocar(40);
    expect(contagem.fetchPush).toBe(40);
    expect(contagem.total()).toBeLessThanOrEqual(TETO_SUBREQUISICOES);
    expect(fila.enviadas).toEqual([]);
  });

  it('NOT-34: com 41, a invocação faz só 40 fetch e a 41.ª vai para a continuação', async () => {
    const { contagem, fila } = await invocar(41);
    expect(contagem.fetchPush).toBe(40);
    expect(contagem.total()).toBeLessThanOrEqual(TETO_SUBREQUISICOES);
    expect(fila.enviadas).toHaveLength(1);
    expect(fila.enviadas[0]?.corpo).toMatchObject({ tipo: 'ranking', aposId: '40' });
  });

  it('NOT-34: 41 com nova tentativa e revogação no meio: continua dentro do teto, contando a fila', async () => {
    const respostas = Array.from({ length: 40 }, (_, i) =>
      i % 10 === 0 ? 503 : i % 10 === 1 ? 410 : 201,
    );
    const { contagem, fila } = await invocar(41, respostas);
    expect(contagem.fetchPush).toBe(40);
    expect(fila.enviadas).toHaveLength(2); // continuação e nova tentativa
    expect(contagem.total()).toBeLessThanOrEqual(TETO_SUBREQUISICOES);
  });
});
