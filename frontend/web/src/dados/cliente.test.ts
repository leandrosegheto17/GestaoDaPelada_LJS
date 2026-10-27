import { QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { escrever, ler, semCorpo, type Esquema } from './cliente';
import { criarClienteConsultas } from './consultas';
import { ErroApi, ErroRede, ErroResposta } from './erros';

const objeto: Esquema<{ n: number }> = {
  safeParse: (d) =>
    typeof d === 'object' && d !== null && typeof (d as { n?: unknown }).n === 'number'
      ? { success: true, data: d as { n: number } }
      : { success: false },
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

function simular(resposta: () => Response) {
  const f = vi.fn<typeof fetch>(() => Promise.resolve(resposta()));
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe('ler e escrever (ACE-49)', () => {
  it('GET vai a /api, com cookie same-origin e sem X-Pelada', async () => {
    const f = simular(() => json({ n: 1 }));
    expect(await ler('/a', objeto)).toEqual({ n: 1 });
    const [url, init] = f.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe('/api/a');
    expect(init?.credentials).toBe('same-origin');
    expect(new Headers(init?.headers).get('x-pelada')).toBeNull();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('%s leva X-Pelada: 1 e corpo JSON', async (metodo) => {
    const f = simular(() => json({ n: 2 }));
    expect(await escrever(metodo, '/a', { k: 1 }, objeto)).toEqual({ n: 2 });
    const init = f.mock.calls[0]![1]!;
    const cab = new Headers(init.headers);
    expect(cab.get('x-pelada')).toBe('1');
    expect(cab.get('content-type')).toBe('application/json');
    expect(init.method).toBe(metodo);
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBe('{"k":1}');
  });

  it('204 devolve undefined', async () => {
    simular(() => new Response(null, { status: 204 }));
    expect(await escrever('POST', '/a', undefined, semCorpo)).toBeUndefined();
  });

  it('caminho inválido falha antes do fetch', () => {
    const f = simular(() => json({ n: 1 }));
    expect(() => ler('//evil.com/x', objeto)).toThrow();
    expect(() => ler('x', objeto)).toThrow();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('erros tipados', () => {
  it('422 vira ErroApi com codigo e campos', async () => {
    simular(() =>
      json({ erro: { codigo: 'dados_invalidos', mensagem: 'Revise.', campos: { email: 'E-mail inválido.' } } }, 422),
    );
    const erro = await ler('/a', objeto).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 422, codigo: 'dados_invalidos', campos: { email: 'E-mail inválido.' } });
  });

  it('campos extras do erro ficam em extras (unico_admin traz grupos)', async () => {
    simular(() =>
      json({ erro: { codigo: 'unico_admin', mensagem: 'x', grupos: [{ id: 'g1', nome: 'Quinta' }] } }, 409),
    );
    const erro = (await ler('/a', objeto).catch((e: unknown) => e)) as ErroApi;
    expect(erro.codigo).toBe('unico_admin');
    expect(erro.extras['grupos']).toEqual([{ id: 'g1', nome: 'Quinta' }]);
  });

  it('erro fora da forma padrão vira ErroResposta', async () => {
    simular(() => new Response('<html>', { status: 502 }));
    const erro = await ler('/a', objeto).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroResposta);
    expect((erro as ErroResposta).status).toBe(502);
  });

  it('corpo que não confere com o contrato vira ErroResposta', async () => {
    simular(() => json({ n: 'x' }));
    await expect(ler('/a', objeto)).rejects.toBeInstanceOf(ErroResposta);
  });

  it('fetch que rejeita vira ErroRede', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('falhou')));
    await expect(ler('/a', objeto)).rejects.toBeInstanceOf(ErroRede);
  });
});

describe('provedor de consultas (ACE-20)', () => {
  async function consultar(cliente: ReturnType<typeof criarClienteConsultas>) {
    cliente.setQueryData(['dado-da-conta'], { privado: true });
    await new QueryObserver(cliente, { queryKey: ['a'], queryFn: () => ler('/a', objeto), retry: false })
      .refetch()
      .catch(() => undefined);
  }

  it('401 sessao_expirada limpa o cache e avisa', async () => {
    simular(() => json({ erro: { codigo: 'sessao_expirada', mensagem: 'Sua sessão expirou. Entre de novo.' } }, 401));
    const aoSessaoExpirada = vi.fn();
    const cliente = criarClienteConsultas({ aoSessaoExpirada });
    await consultar(cliente);
    expect(aoSessaoExpirada).toHaveBeenCalledOnce();
    expect(cliente.getQueryData(['dado-da-conta'])).toBeUndefined();
  });

  it.each([
    [401, 'credenciais_invalidas'],
    [403, 'sem_permissao'],
    [500, 'erro_interno'],
  ])('%s %s não derruba a sessão', async (status, codigo) => {
    simular(() => json({ erro: { codigo, mensagem: 'x' } }, status));
    const aoSessaoExpirada = vi.fn();
    const cliente = criarClienteConsultas({ aoSessaoExpirada });
    await consultar(cliente);
    expect(aoSessaoExpirada).not.toHaveBeenCalled();
    expect(cliente.getQueryData(['dado-da-conta'])).toEqual({ privado: true });
  });
});
