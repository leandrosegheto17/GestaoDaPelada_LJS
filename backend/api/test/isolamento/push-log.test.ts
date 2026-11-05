import { paraBase64url } from '@pelada/contrato/push';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEnviarRanking } from '../../src/aplicacao/notificacoes/enviar-ranking.ts';
import type { Env } from '../../src/entrada/ambiente.ts';
import { bancoSemContexto } from '../../src/entrada/consumidor-avisos.ts';
import type { RelatoPush } from '../../src/infraestrutura/push/enviar.ts';
import { servicoPushFalso } from '../../src/infraestrutura/push/enviar.ts';
import { envCom, fabricaComoApp } from '../db/requisicao.ts';
import { sessaoDe } from '../rotas/apoio-financeiro.ts';
import { chavesVapid, clientePush, endpointDe, type VariaveisVapid } from '../rotas/apoio-push.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from './cenario-grupos.ts';

/**
 * Nada sensível no log (notificacoes T32; NOT-33). Com o `console` inteiro capturado, e o relato ao Sentry do cliente de
 * envio também, assinar, consultar e cancelar (rota pública e da conta) e o envio do ranking pelo consumidor não
 * registram o endpoint, o `p256dh`, o `auth` nem o payload. O serviço de push responde 201, 400 e 503, para passar
 * também pelo relato do erro e pela nova tentativa.
 *
 * As chaves do assinante são P-256 de verdade (a cifra precisa delas), como no teste do envio (T18).
 */

let aberto: CenarioGruposAberto;
let vapid: Required<VariaveisVapid>;
let saidas: unknown[][];
let relatos: RelatoPush[];

async function assinante(): Promise<{ p256dh: string; auth: string }> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const publica = new Uint8Array(
    (await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer,
  );
  return {
    p256dh: paraBase64url(publica),
    auth: paraBase64url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

function capturarConsole(): () => void {
  const espioes = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      saidas.push(a);
    }),
  );
  return () => {
    for (const e of espioes) e.mockRestore();
  };
}

/** Nenhum dos textos aparece no que foi capturado. */
function nadaNoLog(textos: readonly string[]): void {
  const tudo = JSON.stringify({ saidas, relatos });
  for (const t of textos) expect(tudo).not.toContain(t);
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  vapid = await chavesVapid();
  await aberto.db.query(
    `UPDATE grupos SET situacao_comercial = 'ativo', trial_inicio = NULL WHERE id = $1`,
    [aberto.cenario.grupoG],
  );
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  saidas = [];
  relatos = [];
  await aberto.db.query('DELETE FROM push_ranking WHERE grupo_id = $1', [aberto.cenario.grupoG]);
  await aberto.db.query('DELETE FROM push_conta');
});

describe('NOT-33: nada sensível no log', () => {
  it('NOT-33: assinar, consultar e cancelar pela rota pública não registram endpoint nem chaves', async () => {
    const pedir = clientePush(aberto.url, vapid as Partial<Env>);
    const chaves = await assinante();
    const endpoint = endpointDe('log-publico');
    const caminho = `/publico/${aberto.cenario.slugG}/push`;
    const restaurar = capturarConsole();
    try {
      expect((await pedir(caminho, { corpo: { endpoint, chaves } })).status).toBe(201);
      await pedir(`${caminho}/estado`, { corpo: { endpoint, chaves: { auth: chaves.auth } } });
      await pedir(caminho, { metodo: 'DELETE', corpo: { endpoint, chaves: { auth: chaves.auth } } });
      // Um corpo recusado (422) também não ecoa o que veio no log.
      await pedir(caminho, { corpo: { endpoint, chaves, extra: chaves.p256dh } });
    } finally {
      restaurar();
    }
    nadaNoLog([endpoint, chaves.p256dh, chaves.auth]);
  });

  it('NOT-33: assinar, consultar e cancelar pela rota da conta não registram endpoint nem chaves', async () => {
    const pedir = clientePush(aberto.url, vapid as Partial<Env>);
    const sessao = await sessaoDe(aberto, aberto.cenario.contaC);
    const chaves = await assinante();
    const endpoint = endpointDe('log-conta');
    const restaurar = capturarConsole();
    try {
      expect((await pedir('/conta/push', { corpo: { endpoint, chaves }, sessao })).status).toBe(
        201,
      );
      await pedir('/conta/push/estado', {
        corpo: { endpoint, chaves: { auth: chaves.auth } },
        sessao,
      });
      await pedir('/conta/push', {
        metodo: 'DELETE',
        corpo: { endpoint, chaves: { auth: chaves.auth } },
        sessao,
      });
    } finally {
      restaurar();
    }
    nadaNoLog([endpoint, chaves.p256dh, chaves.auth]);
  });

  it('NOT-33: o envio do ranking pelo consumidor, com 201, 400 e 503, não registra endpoint, chaves nem payload', async () => {
    const { db, cenario } = aberto;
    const assinaturas = [] as Array<{ endpoint: string; p256dh: string; auth: string }>;
    for (const nome of ['log-envio-1', 'log-envio-2', 'log-envio-3']) {
      const c = await assinante();
      const s = { endpoint: endpointDe(nome), ...c };
      assinaturas.push(s);
      await db.query(
        'INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)',
        [cenario.grupoG, s.endpoint, s.p256dh, s.auth],
      );
    }
    const servico = servicoPushFalso();
    servico.responder(201, 400, 503);
    const env: Env = { ...envCom(aberto.url), ...vapid };
    const enviar = criarEnviarRanking({
      fetch: servico.fetch,
      reportar: (r) => {
        relatos.push(r);
      },
    });
    const restaurar = capturarConsole();
    try {
      await enviar(
        {
          tipo: 'ranking',
          grupoId: cenario.grupoG,
          dataPartida: '2026-01-08',
          criadoEm: new Date().toISOString(),
          aposId: '0',
          tentativa: 1,
        },
        { env, banco: bancoSemContexto(env, fabricaComoApp().fabrica) },
      );
    } finally {
      restaurar();
    }
    expect(servico.pedidos).toHaveLength(3);
    // O relato do 400 existe, e só com host, status e motivo.
    expect(relatos.some((r) => r.status === 400)).toBe(true);
    for (const r of relatos) expect(Object.keys(r).sort()).toEqual(['host', 'motivo', 'status']);
    nadaNoLog([
      ...assinaturas.flatMap((s) => [s.endpoint, s.p256dh, s.auth]),
      // O payload do ranking (texto e caminho) também fica fora do log.
      `/g/${cenario.slugG}?mes=2026-01`,
      vapid.VAPID_PRIVADA,
    ]);
  });
});
