import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { criarCliente, DESTINO_SESSAO_EXPIRADA, ErroApi, MENSAGEM_REDE } from '../../src/dados/cliente.ts';

function json(status: number, corpo?: unknown): Response {
  if (corpo === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function montar(resposta: Response | (() => Promise<Response>)) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    return typeof resposta === 'function' ? resposta() : resposta.clone();
  }) as unknown as typeof globalThis.fetch;
  const consultas = new QueryClient();
  const navegar = vi.fn();
  const cliente = criarCliente({ consultas, navegar, fetch });
  return { cliente, chamadas, consultas, navegar };
}

function cabecalhos(init: RequestInit): Record<string, string> {
  return Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
}

describe('cliente HTTP', () => {
  for (const metodo of ['post', 'put', 'patch', 'delete'] as const) {
    it(`ACE-49: ${metodo.toUpperCase()} leva X-Pelada: 1 e credentials same-origin`, async () => {
      const { cliente, chamadas } = montar(json(204));
      await cliente[metodo]('/api/qualquer', { a: 1 });
      expect(chamadas).toHaveLength(1);
      const init = chamadas[0]!.init;
      expect(init.method).toBe(metodo.toUpperCase());
      expect(cabecalhos(init)['x-pelada']).toBe('1');
      expect(init.credentials).toBe('same-origin');
      expect(cabecalhos(init)['content-type']).toBe('application/json');
      expect(init.body).toBe(JSON.stringify({ a: 1 }));
    });
  }

  it('ACE-49: escrita sem corpo também leva X-Pelada: 1', async () => {
    const { cliente, chamadas } = montar(json(204));
    await cliente.post('/api/sessao/sair');
    expect(cabecalhos(chamadas[0]!.init)['x-pelada']).toBe('1');
    expect(chamadas[0]!.init.body).toBeUndefined();
  });

  it('ACE-49: GET não leva X-Pelada, mas leva credentials same-origin', async () => {
    const { cliente, chamadas } = montar(json(200, { ok: true }));
    expect(await cliente.get('/api/sessao')).toEqual({ ok: true });
    expect(cabecalhos(chamadas[0]!.init)['x-pelada']).toBeUndefined();
    expect(chamadas[0]!.init.credentials).toBe('same-origin');
  });

  it('ACE-20: 401 sessao_expirada limpa o cache e navega para /entrar?aviso=sessao-expirada', async () => {
    const { cliente, consultas, navegar } = montar(
      json(401, { erro: 'Sua sessão expirou. Entre de novo.', codigo: 'sessao_expirada' }),
    );
    consultas.setQueryData(['sessao'], { id: 'a', nome: 'Ana', email: 'a@x.test', grupos: [] });
    consultas.setQueryData(['grupos', 'g1'], { nome: 'Pelada' });

    const erro = await cliente.get('/api/grupos/g1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect((erro as ErroApi).status).toBe(401);
    expect((erro as ErroApi).codigo).toBe('sessao_expirada');
    expect(consultas.getQueryData(['sessao'])).toBeUndefined();
    expect(consultas.getQueryData(['grupos', 'g1'])).toBeUndefined();
    expect(navegar).toHaveBeenCalledExactlyOnceWith(DESTINO_SESSAO_EXPIRADA);
    expect(DESTINO_SESSAO_EXPIRADA).toBe('/entrar?aviso=sessao-expirada');
  });

  it('ACE-20: 401 sem_sessao não limpa o cache nem navega (a guarda decide)', async () => {
    const { cliente, consultas, navegar } = montar(json(401, { erro: 'Entre para continuar.', codigo: 'sem_sessao' }));
    consultas.setQueryData(['outra'], 1);
    await expect(cliente.get('/api/sessao')).rejects.toMatchObject({ status: 401, codigo: 'sem_sessao' });
    expect(consultas.getQueryData(['outra'])).toBe(1);
    expect(navegar).not.toHaveBeenCalled();
  });

  it('ACE-20: 401 credenciais_invalidas no entrar não navega', async () => {
    const { cliente, navegar } = montar(json(401, { erro: 'E-mail ou senha incorretos.', codigo: 'credenciais_invalidas' }));
    await expect(cliente.post('/api/sessao', { email: 'a@x.test', senha: 'x' })).rejects.toMatchObject({
      codigo: 'credenciais_invalidas',
      message: 'E-mail ou senha incorretos.',
    });
    expect(navegar).not.toHaveBeenCalled();
  });

  it('erro padrão tipado: 422 traz código e campos; 409 traz os grupos', async () => {
    const r422 = montar(json(422, { erro: 'Confira os campos destacados.', codigo: 'dados_invalidos', campos: ['email', 'senha'] }));
    await expect(r422.cliente.post('/api/conta', {})).rejects.toMatchObject({
      status: 422,
      codigo: 'dados_invalidos',
      campos: ['email', 'senha'],
    });
    const grupos = [{ id: 'g1', nome: 'Pelada' }];
    const r409 = montar(json(409, { erro: 'x', codigo: 'unico_admin', grupos }));
    await expect(r409.cliente.delete('/api/conta', { senha: 's' })).rejects.toMatchObject({ status: 409, codigo: 'unico_admin', grupos });
  });

  it('resposta de erro sem corpo do contrato vira ErroApi sem código, com mensagem padrão', async () => {
    const { cliente } = montar(new Response('falhou', { status: 500 }));
    const erro = (await cliente.get('/api/x').catch((e: unknown) => e)) as ErroApi;
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.status).toBe(500);
    expect(erro.codigo).toBeUndefined();
    expect(erro.message).toBeTruthy();
  });

  it('falha de rede vira ErroApi com status 0 e a mensagem de conexão', async () => {
    const { cliente, navegar } = montar(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(cliente.get('/api/x')).rejects.toMatchObject({ status: 0, message: MENSAGEM_REDE });
    expect(navegar).not.toHaveBeenCalled();
  });

  it('204 devolve undefined', async () => {
    const { cliente } = montar(json(204));
    expect(await cliente.delete('/api/sessao')).toBeUndefined();
  });
});
