import * as Sentry from '@sentry/cloudflare';
import type { MensagemAviso } from '@pelada/contrato/fila-avisos';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/entrada/ambiente.ts';
import {
  consumirAvisos,
  type CasosDeUso,
  type Desfecho,
  type MensagemDaFila,
  type MotivoFila,
} from '../../src/entrada/consumidor-avisos.ts';
import { criarWorker, type EmbrulharSentry } from '../../src/entrada/observabilidade.ts';
import { envCom, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenario, type CenarioAberto } from '../isolamento/apoio.ts';

vi.mock('@sentry/cloudflare', async (original) => ({
  ...(await original<typeof import('@sentry/cloudflare')>()),
  captureMessage: vi.fn(),
}));

/**
 * Consumidor da fila `avisos` (notificacoes T17; NOT-22, NOT-33). Casos limite: mensagem válida, inválida, caso de uso
 * que lança e caso de uso que pede nova tentativa; a conexão do consumidor é aberta como `pelada_app` contra um banco
 * `teste_*` migrado, sem conta e sem slug.
 */

let aberto: CenarioAberto;
let env: Env;

beforeAll(async () => {
  aberto = await abrirCenario();
  env = envCom(aberto.url);
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const SEGREDO = 'Pelada Secreta da Rua 7';

const RANKING: MensagemAviso = {
  tipo: 'ranking',
  grupoId: '6f1c2a54-2b1e-4c7a-9a43-0d8f3b1e5c21',
  dataPartida: '2026-11-05',
  criadoEm: '2026-11-05T12:00:00.000Z',
  aposId: '0',
  tentativa: 1,
};

interface MensagemEspiada extends MensagemDaFila {
  acks: number;
  retries: Array<{ delaySeconds?: number } | undefined>;
}

function mensagem(body: unknown): MensagemEspiada {
  const m: MensagemEspiada = {
    body,
    acks: 0,
    retries: [],
    ack: () => {
      m.acks += 1;
    },
    retry: (opcoes) => {
      m.retries.push(opcoes);
    },
  };
  return m;
}

async function consumir(
  body: unknown,
  casos: CasosDeUso,
  relatos: MotivoFila[] = [],
): Promise<MensagemEspiada> {
  const m = mensagem(body);
  await consumirAvisos({ messages: [m] }, env, {
    casos,
    fabrica: fabricaComoApp().fabrica,
    reportar: (motivo) => relatos.push(motivo),
  });
  return m;
}

const concluir = async (): Promise<Desfecho> => ({ acao: 'concluir' });

describe('consumidor da fila avisos', () => {
  it('mensagem válida e caso de uso que conclui: ack, sem retry, com a mensagem conferida', async () => {
    const recebidas: MensagemAviso[] = [];
    const m = await consumir(RANKING, {
      ranking: async (msg) => {
        recebidas.push(msg);
        return { acao: 'concluir' };
      },
    });
    expect(recebidas).toEqual([RANKING]);
    expect(m.acks).toBe(1);
    expect(m.retries).toEqual([]);
  });

  it('caso de uso que pede nova tentativa: retry com o atraso pedido, sem ack', async () => {
    const m = await consumir(RANKING, {
      ranking: async () => ({ acao: 'repetir', aposSegundos: 120 }),
    });
    expect(m.acks).toBe(0);
    expect(m.retries).toEqual([{ delaySeconds: 120 }]);
  });

  it('caso de uso que lança: retry sem atraso e relato só com o motivo, sem a mensagem do erro', async () => {
    const relatos: MotivoFila[] = [];
    const m = await consumir(
      RANKING,
      {
        ranking: async () => {
          throw new Error(SEGREDO);
        },
      },
      relatos,
    );
    expect(m.acks).toBe(0);
    expect(m.retries).toEqual([undefined]);
    expect(relatos).toEqual(['caso_de_uso_falhou']);
    expect(JSON.stringify(relatos)).not.toContain(SEGREDO);
  });

  it('NOT-22: a conexão do consumidor não tem app.conta_id nem app.slug_publico e roda como pelada_app', async () => {
    let lido: unknown;
    const m = await consumir(RANKING, {
      ranking: async (_msg, { banco }) => {
        lido = await banco(async (db) => {
          const r = await sql<{
            conta: string | null;
            slug: string | null;
            funcao_conta: string | null;
            papel: string;
          }>`
            SELECT current_setting('app.conta_id', true) AS conta,
                   current_setting('app.slug_publico', true) AS slug,
                   app_conta_id()::text AS funcao_conta,
                   current_user AS papel`.execute(db);
          return r.rows[0];
        });
        return { acao: 'concluir' };
      },
    });
    expect(lido).toEqual({ conta: '', slug: '', funcao_conta: null, papel: 'pelada_app' });
    expect(m.acks).toBe(1);
  });

  it('NOT-33: mensagem inválida é descartada e vai ao Sentry sem o corpo', async () => {
    const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((n) =>
      vi.spyOn(console, n),
    );
    const caso = vi.fn(concluir);
    const corpo = { ...RANKING, nome: SEGREDO, email: 'criadora@exemplo.com' };
    const m = mensagem(corpo);
    // Sem `reportar`: o relato padrão, pelo Sentry (simulado neste arquivo).
    await consumirAvisos({ messages: [m] }, env, {
      casos: { ranking: caso },
      fabrica: fabricaComoApp().fabrica,
    });

    expect(caso).not.toHaveBeenCalled();
    expect(m.acks).toBe(1);
    expect(m.retries).toEqual([]);
    const captura = vi.mocked(Sentry.captureMessage);
    expect(captura).toHaveBeenCalledTimes(1);
    expect(captura.mock.calls[0]).toEqual([
      'fila_avisos',
      { level: 'warning', tags: { motivo: 'mensagem_invalida' } },
    ]);
    const tudo = JSON.stringify([captura.mock.calls, consoles.map((c) => c.mock.calls)]);
    for (const proibido of [SEGREDO, 'criadora@exemplo.com', RANKING.grupoId])
      expect(tudo).not.toContain(proibido);
  });

  it('corpo que não é objeto: descartado como inválido', async () => {
    for (const body of [null, 'ranking', 42]) {
      const relatos: MotivoFila[] = [];
      const m = await consumir(body, { ranking: concluir }, relatos);
      expect(m.acks).toBe(1);
      expect(relatos).toEqual(['mensagem_invalida']);
    }
  });

  it('tipo sem caso de uso ligado: ack e relato sem_caso_de_uso', async () => {
    const relatos: MotivoFila[] = [];
    const cobranca: MensagemAviso = {
      tipo: 'cobranca',
      idExterno: 'pay_1',
      aviso: 'cobranca_gerada',
      grupoId: RANKING.grupoId,
      valorCentavos: 990,
      vencimento: '2026-11-10',
      tentativa: 1,
    };
    const m = await consumir(cobranca, { ranking: concluir }, relatos);
    expect(m.acks).toBe(1);
    expect(relatos).toEqual(['sem_caso_de_uso']);
  });

  it('um lote com duas mensagens: cada uma com o seu desfecho', async () => {
    const a = mensagem(RANKING);
    const b = mensagem({ ...RANKING, tentativa: 2 });
    await consumirAvisos({ messages: [a, b] }, env, {
      casos: {
        ranking: async (msg) => (msg.tentativa === 1 ? { acao: 'concluir' } : { acao: 'repetir' }),
      },
      fabrica: fabricaComoApp().fabrica,
      reportar: () => undefined,
    });
    expect([a.acks, a.retries]).toEqual([1, []]);
    expect([b.acks, b.retries]).toEqual([0, [undefined]]);
  });
});

describe('criarWorker com o consumidor', () => {
  const lote = { messages: [] };

  it('sem SENTRY_DSN, o queue vai direto ao consumidor', async () => {
    const queue = vi.fn(async () => undefined);
    const embrulhar = vi.fn<EmbrulharSentry>((_opcoes, m) => m);
    const worker = criarWorker({ fetch: () => new Response(null), queue }, embrulhar);
    await worker.queue?.(lote, env, {});
    expect(queue).toHaveBeenCalledWith(lote, env, {});
  });

  it('com SENTRY_DSN, o queue passa pelo embrulho do Sentry', async () => {
    const queue = vi.fn(async () => undefined);
    const pelaEmbrulhada = vi.fn(async () => undefined);
    const embrulhar: EmbrulharSentry = (_opcoes, m) => ({ fetch: m.fetch, queue: pelaEmbrulhada });
    const worker = criarWorker({ fetch: () => new Response(null), queue }, embrulhar);
    const comDsn = { ...env, SENTRY_DSN: 'https://chave@o0.ingest.sentry.io/1' } as Env;
    await worker.queue?.(lote, comDsn, {});
    expect(pelaEmbrulhada).toHaveBeenCalledWith(lote, comDsn, {});
    expect(queue).not.toHaveBeenCalled();
  });
});
