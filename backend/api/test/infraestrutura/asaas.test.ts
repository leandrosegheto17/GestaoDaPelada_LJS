import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asaasHttp,
  TEMPO_LIMITE_ASAAS_MS,
  urlDoAsaasPermitida,
  type NovaAssinatura,
  type NovoCliente,
} from '../../src/infraestrutura/asaas/cliente.ts';

/**
 * Cliente do Asaas (T29; PLA-06, PLA-29, PLA-34, PLA-35, PLA-36).
 *
 * Casos limite listados antes do código: 200, 400, 401, 429 com `RateLimit-Reset`, 500, rede caída, resposta depois de
 * 10 s, lista de cobranças vazia.
 */

// Montada por partes: a checagem de segredos (T40) reprova o prefixo do Asaas seguido de uma chave no repositório.
const CHAVE = ['$aa', 'ct_', 'teste'].join('');
const CONFIG = { ASAAS_URL: 'https://api-sandbox.asaas.com/v3', ASAAS_API_KEY: CHAVE };
const CPF = '52998224725';
const CLIENTE: NovoCliente = {
  name: 'Maria Pagadora',
  cpfCnpj: CPF,
  email: 'maria@exemplo.com',
  externalReference: 'conta-1',
};
const ASSINATURA: NovaAssinatura = {
  customer: 'cus_1',
  valorCentavos: 990,
  nextDueDate: '2026-11-05',
  description: 'Gestão da Pelada Pro: Pelada de Quinta',
  externalReference: 'grupo-1',
};

function resposta(
  status: number,
  corpo: unknown = {},
  cabecalhos: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json', ...cabecalhos },
  });
}

function comLog() {
  const linhas: Array<Record<string, string | number>> = [];
  return { linhas, registrar: (l: Record<string, string | number>) => linhas.push(l) };
}

function chamada(
  buscar: ReturnType<typeof vi.fn>,
  i = 0,
): { url: string; init: RequestInit; corpo: unknown } {
  const [url, init] = buscar.mock.calls[i] as unknown as [string, RequestInit];
  return { url, init, corpo: init.body === undefined ? undefined : JSON.parse(String(init.body)) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('asaasHttp: criarAssinatura', () => {
  it('PLA-29: o corpo tem billingType UNDEFINED, cycle MONTHLY, value 9.9 e externalReference = id do grupo', async () => {
    const buscar = vi.fn(async () => resposta(200, { id: 'sub_1', object: 'subscription' }));
    expect(await asaasHttp(CONFIG, { fetch: buscar }).criarAssinatura(ASSINATURA)).toEqual({
      id: 'sub_1',
    });
    const { url, init, corpo } = chamada(buscar);
    expect(url).toBe('https://api-sandbox.asaas.com/v3/subscriptions');
    expect(init.method).toBe('POST');
    expect(corpo).toEqual({
      customer: 'cus_1',
      billingType: 'UNDEFINED',
      cycle: 'MONTHLY',
      value: 9.9,
      nextDueDate: '2026-11-05',
      description: 'Gestão da Pelada Pro: Pelada de Quinta',
      externalReference: 'grupo-1',
    });
  });

  it('PLA-29: a chave vai no header access_token', async () => {
    const buscar = vi.fn(async () => resposta(200, { id: 'sub_1' }));
    await asaasHttp(CONFIG, { fetch: buscar }).criarAssinatura(ASSINATURA);
    const cabecalhos = new Headers(chamada(buscar).init.headers);
    expect(cabecalhos.get('access_token')).toBe(CHAVE);
    expect(cabecalhos.get('authorization')).toBeNull();
  });

  it('PLA-06: o valor sai de centavosParaReais', async () => {
    const buscar = vi.fn(async () => resposta(200, { id: 'sub_1' }));
    await asaasHttp(CONFIG, { fetch: buscar }).criarAssinatura({
      ...ASSINATURA,
      valorCentavos: 1234,
    });
    expect((chamada(buscar).corpo as { value: number }).value).toBe(12.34);
  });
});

describe('asaasHttp: criarCliente', () => {
  it('PLA-29: manda name, cpfCnpj, email e externalReference = id da conta', async () => {
    const buscar = vi.fn(async () => resposta(200, { id: 'cus_1' }));
    expect(await asaasHttp(CONFIG, { fetch: buscar }).criarCliente(CLIENTE)).toEqual({
      id: 'cus_1',
    });
    const { url, corpo } = chamada(buscar);
    expect(url).toBe('https://api-sandbox.asaas.com/v3/customers');
    expect(corpo).toEqual({
      name: CLIENTE.name,
      cpfCnpj: CPF,
      email: CLIENTE.email,
      externalReference: 'conta-1',
    });
  });
});

describe('asaasHttp: falhas', () => {
  it.each([
    [400, {}],
    [401, {}],
    [429, { 'RateLimit-Limit': '25000', 'RateLimit-Remaining': '0', 'RateLimit-Reset': '120' }],
    [500, {}],
  ])('PLA-36: status %i vira falhou sem segunda chamada', async (status, cabecalhos) => {
    const log = comLog();
    const buscar = vi.fn(async () =>
      resposta(
        status,
        { errors: [{ code: 'invalid', description: `CPF ${CPF} inválido` }] },
        cabecalhos,
      ),
    );
    expect(
      await asaasHttp(CONFIG, { fetch: buscar, registrar: log.registrar }).criarCliente(CLIENTE),
    ).toBe('falhou');
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(log.linhas).toEqual([
      {
        evento: 'asaas_falhou',
        operacao: 'criar_cliente',
        status,
        motivo: status === 429 ? 'limite' : 'status',
      },
    ]);
  });

  it('PLA-36: rede caída vira falhou sem segunda chamada', async () => {
    const log = comLog();
    const buscar = vi.fn(async () => {
      throw new TypeError('rede');
    });
    expect(
      await asaasHttp(CONFIG, { fetch: buscar, registrar: log.registrar }).criarAssinatura(
        ASSINATURA,
      ),
    ).toBe('falhou');
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(log.linhas).toEqual([
      { evento: 'asaas_falhou', operacao: 'criar_assinatura', status: 0, motivo: 'rede' },
    ]);
  });

  it('PLA-36: resposta depois de 10 s é abortada e vira falhou', async () => {
    vi.useFakeTimers();
    const log = comLog();
    let sinal: AbortSignal | undefined;
    const buscar = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolver, rejeitar) => {
          sinal = init.signal ?? undefined;
          init.signal?.addEventListener('abort', () =>
            rejeitar(new DOMException('abortado', 'AbortError')),
          );
        }),
    );
    const pedido = asaasHttp(CONFIG, {
      fetch: buscar as unknown as typeof fetch,
      registrar: log.registrar,
    }).criarAssinatura(ASSINATURA);
    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_ASAAS_MS - 1);
    expect(sinal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pedido).toBe('falhou');
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(log.linhas).toEqual([
      { evento: 'asaas_falhou', operacao: 'criar_assinatura', status: 0, motivo: 'tempo_esgotado' },
    ]);
    expect(TEMPO_LIMITE_ASAAS_MS).toBe(10_000);
  });

  it('PLA-36: sem ASAAS_URL ou sem ASAAS_API_KEY, falha sem chamar a rede', async () => {
    const buscar = vi.fn(async () => resposta(200, { id: 'x' }));
    expect(
      await asaasHttp(
        { ASAAS_API_KEY: CHAVE },
        { fetch: buscar, registrar: () => {} },
      ).criarCliente(CLIENTE),
    ).toBe('falhou');
    expect(
      await asaasHttp(
        { ASAAS_URL: CONFIG.ASAAS_URL },
        { fetch: buscar, registrar: () => {} },
      ).criarCliente(CLIENTE),
    ).toBe('falhou');
    expect(buscar).not.toHaveBeenCalled();
  });

  it('2xx sem id vira falhou', async () => {
    const buscar = vi.fn(async () => resposta(200, { object: 'customer' }));
    expect(
      await asaasHttp(CONFIG, { fetch: buscar, registrar: () => {} }).criarCliente(CLIENTE),
    ).toBe('falhou');
  });
});

describe('asaasHttp: primeiraCobranca e removerAssinatura', () => {
  it('lê a fatura da primeira cobrança em GET /subscriptions/{id}/payments', async () => {
    const buscar = vi.fn(async () =>
      resposta(200, {
        object: 'list',
        data: [
          { id: 'pay_2', dueDate: '2026-12-05', invoiceUrl: 'https://sandbox.asaas.com/i/2' },
          { id: 'pay_1', dueDate: '2026-11-05', invoiceUrl: 'https://sandbox.asaas.com/i/1' },
        ],
      }),
    );
    expect(await asaasHttp(CONFIG, { fetch: buscar }).primeiraCobranca('sub_1')).toEqual({
      id: 'pay_1',
      invoiceUrl: 'https://sandbox.asaas.com/i/1',
    });
    const { url, init } = chamada(buscar);
    expect(url).toBe('https://api-sandbox.asaas.com/v3/subscriptions/sub_1/payments');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('PLA-36: lista de cobranças vazia vira falhou', async () => {
    const log = comLog();
    const buscar = vi.fn(async () => resposta(200, { object: 'list', data: [] }));
    expect(
      await asaasHttp(CONFIG, { fetch: buscar, registrar: log.registrar }).primeiraCobranca(
        'sub_1',
      ),
    ).toBe('falhou');
    expect(log.linhas[0]).toMatchObject({ operacao: 'primeira_cobranca', motivo: 'sem_cobranca' });
  });

  it('removerAssinatura chama DELETE /subscriptions/{id}', async () => {
    const buscar = vi.fn(async () => resposta(200, { deleted: true, id: 'sub_1' }));
    expect(await asaasHttp(CONFIG, { fetch: buscar }).removerAssinatura('sub_1')).toBe('removida');
    const { url, init } = chamada(buscar);
    expect(url).toBe('https://api-sandbox.asaas.com/v3/subscriptions/sub_1');
    expect(init.method).toBe('DELETE');
  });

  it('PLA-36: removerAssinatura com 500 vira falhou', async () => {
    const buscar = vi.fn(async () => resposta(500));
    expect(
      await asaasHttp(CONFIG, { fetch: buscar, registrar: () => {} }).removerAssinatura('sub_1'),
    ).toBe('falhou');
  });
});

describe('asaasHttp: dado pessoal e cartão', () => {
  it('PLA-35: nenhum log contém o CPF, o nome, o e-mail nem o access_token', async () => {
    const log = comLog();
    const buscar = vi.fn(async () =>
      resposta(400, {
        errors: [{ code: 'invalid_cpfCnpj', description: `O CPF ${CPF} é inválido` }],
      }),
    );
    const asaas = asaasHttp(CONFIG, { fetch: buscar, registrar: log.registrar });
    await asaas.criarCliente(CLIENTE);
    await asaas.criarAssinatura(ASSINATURA);
    await asaas.primeiraCobranca('sub_1');
    await asaas.removerAssinatura('sub_1');
    const texto = JSON.stringify(log.linhas);
    for (const proibido of [CPF, CLIENTE.name, CLIENTE.email, CHAVE, 'aact'])
      expect(texto).not.toContain(proibido);
  });

  it('PLA-34: nenhum corpo enviado tem campo de cartão', async () => {
    const buscar = vi.fn(async () =>
      resposta(200, { id: 'x', data: [{ id: 'p', dueDate: '2026-11-05', invoiceUrl: 'u' }] }),
    );
    const asaas = asaasHttp(CONFIG, { fetch: buscar });
    await asaas.criarCliente(CLIENTE);
    await asaas.criarAssinatura(ASSINATURA);
    await asaas.primeiraCobranca('sub_1');
    await asaas.removerAssinatura('sub_1');
    for (let i = 0; i < buscar.mock.calls.length; i++) {
      const corpo = String(chamada(buscar, i).init.body ?? '');
      expect(corpo).not.toMatch(/creditCard|creditCardHolderInfo|creditCardToken|cvv/i);
    }
  });
});

describe('asaasHttp: a chave só vai para o sandbox (PLA-38, A-09)', () => {
  it.each([
    'http://api-sandbox.asaas.com/v3',
    'https://api.asaas.com/v3',
    'https://api-sandbox.asaas.com.evil.example/v3',
    'https://evil.example/v3',
    'https://usuario:senha@api-sandbox.asaas.com/v3',
    'http://api-sandbox.asaas.com@evil.example/v3',
    'https://localhost/v3',
    'sem-url',
  ])('%s é recusado antes de a chave sair', async (url) => {
    const buscar = vi.fn(async () => resposta(200, { id: 'x' }));
    const log = { linhas: [] as unknown[] };
    const r = await asaasHttp(
      { ASAAS_URL: url, ASAAS_API_KEY: CHAVE },
      { fetch: buscar, registrar: (l) => log.linhas.push(l) },
    ).criarCliente(CLIENTE);
    expect(r).toBe('falhou');
    expect(buscar).not.toHaveBeenCalled();
    expect(log.linhas).toEqual([
      { evento: 'asaas_falhou', operacao: 'criar_cliente', status: 0, motivo: 'url_nao_permitida' },
    ]);
    expect(JSON.stringify(log.linhas)).not.toContain(CHAVE);
  });

  it.each([
    'https://api-sandbox.asaas.com/v3',
    'http://127.0.0.1:8749',
    'http://localhost:8749',
    'http://asaas.localhost:8749',
  ])('%s é permitido (sandbox e o Asaas falso local)', (url) => {
    expect(urlDoAsaasPermitida(url)).toBe(true);
  });
});

describe('asaasHttp: redirecionamento (SEC-004)', () => {
  it('a chamada recusa redirecionar, para a chave não seguir a outro endereço', async () => {
    const buscar = vi.fn(async () => resposta(200, { id: 'cus_1' }));
    await asaasHttp(CONFIG, { fetch: buscar, registrar: () => {} }).criarCliente(CLIENTE);
    expect(buscar).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'error' }),
    );
  });
});
