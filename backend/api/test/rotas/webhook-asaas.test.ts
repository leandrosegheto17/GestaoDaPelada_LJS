import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Env, LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import {
  CHAVE_LIMITE_WEBHOOK,
  CHAVE_RECUSADO_WEBHOOK,
  LIMITE_CORPO_WEBHOOK_BYTES,
} from '../../src/entrada/rotas/webhook-asaas.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `POST /api/webhooks/asaas`: token, limite e corpo (planos-e-cobranca T35; PLA-39, PLA-40, PLA-50; AD-093), com o
 * app real como `pelada_app`. Os eventos usam ids `evt_t35_…` e assinatura desconhecida (a aplicação do efeito é da
 * T36); o `afterEach` os apaga como superusuário.
 *
 * Evidência da rede (registrar na T35 do tasks.md, pelo /executar): tirar a exceção do `exigirCabecalhoPelada` deixa
 * vermelho "sem X-Pelada e com o token: 200"; trocar a conferência por `recebido !== undefined` deixa vermelho o
 * "header errado".
 */

const TOKEN = 'token-do-webhook-de-teste-0123456789';
const CHAVE_API = 'chave-da-api-de-teste-9876543210';
let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await aberto.db.query(`DELETE FROM eventos_asaas WHERE id LIKE 'evt\\_t35\\_%' ESCAPE '\\'`);
});

afterAll(async () => {
  await aberto?.fechar();
});

interface Envio {
  token?: string | null;
  corpo?: unknown;
  cru?: string;
  pelada?: boolean;
  metodo?: string;
  caminho?: string;
  env?: Partial<Env>;
}

async function enviar(e: Envio = {}): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json' });
  const token = e.token === undefined ? TOKEN : e.token;
  if (token !== null) headers.set('asaas-access-token', token);
  if (e.pelada) headers.set('x-pelada', '1');
  const ctx = contextoFalso();
  const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica });
  const r = await app.request(
    e.caminho ?? '/api/webhooks/asaas',
    {
      method: e.metodo ?? 'POST',
      headers,
      body: e.cru ?? JSON.stringify(e.corpo ?? evento('evt_t35_padrao')),
    },
    envAcesso(aberto.url, {
      ASAAS_WEBHOOK_TOKEN: TOKEN,
      ASAAS_API_KEY: CHAVE_API,
      ...e.env,
    }),
    ctx,
  );
  await ctx.esperar();
  return r;
}

function evento(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    event: 'PAYMENT_CREATED',
    dateCreated: '2026-11-05 10:00:00',
    payment: {
      id: 'pay_t35',
      subscription: 'sub_t35_desconhecida',
      value: 9.9,
      dueDate: '2026-11-05',
    },
    ...extra,
  };
}

async function eventosGravados(): Promise<string[]> {
  const r = await aberto.db.query<{ id: string }>(
    `SELECT id FROM eventos_asaas WHERE id LIKE 'evt\\_t35\\_%' ESCAPE '\\' ORDER BY id`,
  );
  return r.rows.map((l) => l.id);
}

/** Tudo o que foi aos logs do console durante o teste. */
function espiarLogs(): () => string {
  const espias = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
  return () =>
    espias.flatMap((s) => s.mock.calls.map((args) => args.map(String).join(' '))).join('\n');
}

/** Corpo JSON válido com exatamente `bytes` bytes. */
function corpoComTamanho(id: string, bytes: number): string {
  const base = JSON.stringify({ ...evento(id), x: '' });
  return base.replace('"x":""', `"x":"${'a'.repeat(bytes - base.length)}"`);
}

describe('POST /api/webhooks/asaas: token (PLA-39)', () => {
  it('PLA-39: sem header responde 401, não grava e o log não traz o token', async () => {
    const logs = espiarLogs();
    const r = await enviar({ token: null, corpo: evento('evt_t35_sem_header') });
    expect(r.status).toBe(401);
    expect(await eventosGravados()).toEqual([]);
    expect(logs()).not.toContain(TOKEN);
  });

  it('PLA-39: header errado responde 401, não grava e o log não traz o valor recebido', async () => {
    const logs = espiarLogs();
    const errado = 'valor-errado-que-nao-pode-ir-ao-log';
    const r = await enviar({ token: errado, corpo: evento('evt_t35_errado') });
    expect(r.status).toBe(401);
    expect(await eventosGravados()).toEqual([]);
    expect(logs()).not.toContain(errado);
    expect(logs()).not.toContain(TOKEN);
  });

  it('PLA-39: header com o token mais um caractere (prefixo certo) responde 401', async () => {
    const r = await enviar({ token: `${TOKEN}x`, corpo: evento('evt_t35_prefixo') });
    expect(r.status).toBe(401);
    expect(await eventosGravados()).toEqual([]);
  });

  it('PLA-39: a chave da API no header responde 401, sem gravar e sem log da chave', async () => {
    const logs = espiarLogs();
    const r = await enviar({ token: CHAVE_API, corpo: evento('evt_t35_chave_api') });
    expect(r.status).toBe(401);
    expect(await eventosGravados()).toEqual([]);
    expect(logs()).not.toContain(CHAVE_API);
  });

  it('PLA-39: sem ASAAS_WEBHOOK_TOKEN configurado, até o header vazio responde 401', async () => {
    const r = await enviar({
      token: '',
      corpo: evento('evt_t35_sem_config'),
      env: { ASAAS_WEBHOOK_TOKEN: '' },
    });
    expect(r.status).toBe(401);
    expect(await eventosGravados()).toEqual([]);
  });

  it('PLA-39: token certo responde 200 e grava o evento', async () => {
    const r = await enviar({ corpo: evento('evt_t35_certo') });
    expect(r.status).toBe(200);
    expect(await eventosGravados()).toEqual(['evt_t35_certo']);
  });
});

describe('POST /api/webhooks/asaas: limite e tamanho (PLA-40)', () => {
  it('PLA-40: o binding negando responde 429 com a chave fixa, sem gravar', async () => {
    const chaves: string[] = [];
    const nega: LimiteDeTaxa = {
      limit: async ({ key }) => {
        chaves.push(key);
        return { success: false };
      },
    };
    const r = await enviar({ corpo: evento('evt_t35_limite'), env: { LIMITE_WEBHOOK: nega } });
    expect(r.status).toBe(429);
    expect(chaves).toEqual([CHAVE_LIMITE_WEBHOOK]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('PLA-40 (A-08): sem o token, o limite conta por IP e nunca na chave fixa do Asaas', async () => {
    const chaves: string[] = [];
    const conta: LimiteDeTaxa = {
      limit: async ({ key }) => {
        chaves.push(key);
        return { success: true };
      },
    };
    const r = await enviar({
      token: 'chute',
      corpo: evento('evt_a08'),
      env: { LIMITE_WEBHOOK: conta },
    });
    expect(r.status).toBe(401);
    expect(chaves).toHaveLength(1);
    expect(chaves[0]!.startsWith(CHAVE_RECUSADO_WEBHOOK)).toBe(true);
    expect(chaves).not.toContain(CHAVE_LIMITE_WEBHOOK);
  });

  it('PLA-40 (A-08): sem o token e acima do limite do IP, 429 (e a chave do Asaas segue livre)', async () => {
    const nega: LimiteDeTaxa = { limit: async () => ({ success: false }) };
    const r = await enviar({
      token: null,
      corpo: evento('evt_a08b'),
      env: { LIMITE_WEBHOOK: nega },
    });
    expect(r.status).toBe(429);
    expect(await eventosGravados()).toEqual([]);
  });

  it('PLA-40 (A-08): o Asaas com o token certo não é afetado pela cota de quem errou o token', async () => {
    const porChave: Record<string, number> = {};
    const limite: LimiteDeTaxa = {
      limit: async ({ key }) => {
        porChave[key] = (porChave[key] ?? 0) + 1;
        return { success: !key.startsWith(CHAVE_RECUSADO_WEBHOOK) };
      },
    };
    for (let i = 0; i < 70; i += 1) {
      await enviar({
        token: 'chute',
        corpo: evento(`evt_a08_${i}`),
        env: { LIMITE_WEBHOOK: limite },
      });
    }
    const certo = await enviar({ corpo: evento('evt_a08_certo'), env: { LIMITE_WEBHOOK: limite } });
    expect(certo.status).toBe(200);
  });

  it('PLA-40: corpo de 65.537 bytes responde 413, sem gravar', async () => {
    const cru = corpoComTamanho('evt_t35_grande', LIMITE_CORPO_WEBHOOK_BYTES + 1);
    expect(new TextEncoder().encode(cru).length).toBe(65_537);
    const r = await enviar({ cru });
    expect(r.status).toBe(413);
    expect(await eventosGravados()).toEqual([]);
  });

  it('PLA-40: corpo de exatamente 64 KiB é aceito', async () => {
    const cru = corpoComTamanho('evt_t35_no_limite', LIMITE_CORPO_WEBHOOK_BYTES);
    const r = await enviar({ cru });
    expect(r.status).toBe(200);
    expect(await eventosGravados()).toEqual(['evt_t35_no_limite']);
  });
});

describe('POST /api/webhooks/asaas: corpo (PLA-50)', () => {
  it('PLA-50: corpo sem event responde 400, sem gravar', async () => {
    const { event: _sem, ...corpo } = evento('evt_t35_sem_event');
    const r = await enviar({ corpo });
    expect(r.status).toBe(400);
    expect(await eventosGravados()).toEqual([]);
  });

  it('PLA-50: corpo sem id responde 400', async () => {
    const { id: _sem, ...corpo } = evento('evt_t35_sem_id');
    expect((await enviar({ corpo })).status).toBe(400);
  });

  it('PLA-50: JSON inválido responde 400', async () => {
    expect((await enviar({ cru: '{"id": "evt_t35_quebrado",' })).status).toBe(400);
    expect(await eventosGravados()).toEqual([]);
  });

  it('PLA-50: campo novo e campo conhecido com tipo inesperado seguem: 200 e gravado', async () => {
    const r = await enviar({
      corpo: evento('evt_t35_campo_novo', {
        campoQueOAsaasAcrescentou: { qualquer: true },
        payment: { id: 'pay_t35', value: 'nove e noventa', subscription: 12 },
      }),
    });
    expect(r.status).toBe(200);
    expect(await eventosGravados()).toEqual(['evt_t35_campo_novo']);
  });

  it('PLA-41: o evento gravado não traz dado de pessoa do customer', async () => {
    const r = await enviar({
      corpo: evento('evt_t35_customer', {
        customer: { name: 'Bia Souza', email: 'bia@exemplo.test', cpfCnpj: '52998224725' },
      }),
    });
    expect(r.status).toBe(200);
    const linha = await aberto.db.query(
      `SELECT * FROM eventos_asaas WHERE id = 'evt_t35_customer'`,
    );
    const texto = JSON.stringify(linha.rows);
    expect(texto).not.toContain('Bia Souza');
    expect(texto).not.toContain('bia@exemplo.test');
    expect(texto).not.toContain('52998224725');
  });
});

describe('X-Pelada (AD-093)', () => {
  it('sem X-Pelada e com o token: 200 (a única exceção)', async () => {
    expect((await enviar({ corpo: evento('evt_t35_sem_pelada') })).status).toBe(200);
  });

  it('o X-Pelada continua exigido nas outras escritas de /api/*', async () => {
    const r = await enviar({ caminho: '/api/conta', corpo: { email: 'x@exemplo.test' } });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'origem_recusada' });
  });

  it('outro método no caminho do webhook continua exigindo o X-Pelada', async () => {
    const r = await enviar({ metodo: 'PUT', corpo: evento('evt_t35_put') });
    expect(r.status).toBe(403);
    expect(await eventosGravados()).toEqual([]);
  });

  it('subcaminho do webhook não é isento', async () => {
    const r = await enviar({ caminho: '/api/webhooks/asaas/outro', corpo: evento('evt_t35_sub') });
    expect(r.status).toBe(403);
  });
});
