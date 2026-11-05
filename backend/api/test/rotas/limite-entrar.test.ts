import { describe, expect, it } from 'vitest';
import type { Env, LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { ROTAS_LIMITE_ENTRAR } from '../../src/entrada/middlewares/limite-taxa.ts';

/**
 * Chave do limitador pelo /64 e `LIMITE_ENTRAR` nas rotas de acesso (T19; ACE-50, ACE-70,
 * ACE-71). As rotas ainda não existem: o limitador responde antes delas (429) ou deixa passar
 * para o 404.
 */

/** Binding falso com cota por chave, guardando as chaves recebidas. */
function bindingPorChave(cota: number): LimiteDeTaxa & { chaves: string[] } {
  const usadas = new Map<string, number>();
  const chaves: string[] = [];
  return {
    chaves,
    limit: async ({ key }) => {
      chaves.push(key);
      const n = (usadas.get(key) ?? 0) + 1;
      usadas.set(key, n);
      return { success: n <= cota };
    },
  };
}

const permite: LimiteDeTaxa = { limit: async () => ({ success: true }) };
const nega: LimiteDeTaxa = { limit: async () => ({ success: false }) };

function montar(entrar: LimiteDeTaxa, outros: LimiteDeTaxa = permite) {
  const app = criarApp();
  const env = {
    VERSAO: 'v',
    URL_PUBLICA: '',
    // Sem banco: qualquer consulta falharia com 503, e o 429 prova que nenhuma aconteceu.
    HYPERDRIVE: { connectionString: 'postgres://ninguem:nada@127.0.0.1:1/nada' },
    LIMITE_ENTRAR: entrar,
    LIMITE_PUBLICO: outros,
    LIMITE_WEBHOOK: outros,
    LIMITE_ESCRITA: outros,
  } as unknown as Env;
  const pedir = (caminho: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('x-pelada', '1');
    return app.request(`/api${caminho}`, { method: 'POST', ...init, headers }, env);
  };
  return { pedir };
}

describe('LIMITE_ENTRAR nas rotas de acesso', () => {
  it('ACE-50: a lista de rotas com LIMITE_ENTRAR é a do design, com trocar senha e excluir conta (ACE-70)', () => {
    expect([...ROTAS_LIMITE_ENTRAR].sort()).toEqual(
      [
        '/conta',
        '/conta/confirmar',
        '/conta/reenviar-confirmacao',
        '/sessao/entrar',
        '/sessao/esqueci-senha',
        '/sessao/nova-senha',
        '/convites/ler',
        '/convites/cadastrar',
        '/conta/senha',
        '/conta/excluir',
      ].sort(),
    );
  });

  it.each([...ROTAS_LIMITE_ENTRAR])(
    'ACE-50: POST /api%s acima do LIMITE_ENTRAR responde 429',
    async (rota) => {
      const { pedir } = montar(nega);
      const r = await pedir(rota, { headers: { 'cf-connecting-ip': '203.0.113.7' } });
      expect(r.status).toBe(429);
      expect(r.headers.get('retry-after')).toBe('60');
    },
  );

  it.each([...ROTAS_LIMITE_ENTRAR])(
    'ACE-50: POST /api%s dentro do LIMITE_ENTRAR não recebe 429',
    async (rota) => {
      const { pedir } = montar(permite, nega);
      const r = await pedir(rota, { headers: { 'cf-connecting-ip': '203.0.113.7' } });
      expect(r.status).not.toBe(429);
    },
  );

  it('ACE-50: rotas com sessão fora da lista (GET /api/sessao, sair) não usam o LIMITE_ENTRAR', async () => {
    const { pedir } = montar(nega);
    expect((await pedir('/sessao', { method: 'GET' })).status).not.toBe(429);
    expect((await pedir('/sessao/sair')).status).not.toBe(429);
  });

  it('ACE-70: POST /api/conta/senha acima do limite responde 429 antes de qualquer consulta ao banco', async () => {
    const { pedir } = montar(nega);
    // Com cookie de sessão: a leitura da sessão consultaria o banco (que não existe) e daria 503.
    const r = await pedir('/conta/senha', {
      headers: { 'cf-connecting-ip': '203.0.113.7', cookie: '__Host-sessao=qualquer' },
    });
    expect(r.status).toBe(429);
  });

  it('ACE-70: POST /api/conta/excluir acima do limite também responde 429 antes do banco', async () => {
    const { pedir } = montar(nega);
    const r = await pedir('/conta/excluir', { headers: { cookie: '__Host-sessao=qualquer' } });
    expect(r.status).toBe(429);
  });
});

describe('chave do limitador', () => {
  it('ACE-71: dois IPv6 do mesmo /64 dividem a cota', async () => {
    const entrar = bindingPorChave(1);
    const { pedir } = montar(entrar);
    const primeiro = await pedir('/sessao/entrar', {
      headers: { 'cf-connecting-ip': '2001:db8:1:2:aaaa::1' },
    });
    const segundo = await pedir('/sessao/entrar', {
      headers: { 'cf-connecting-ip': '2001:db8:1:2:bbbb::9' },
    });
    expect(primeiro.status).not.toBe(429);
    expect(segundo.status).toBe(429);
    expect(entrar.chaves[0]).toBe(entrar.chaves[1]);
  });

  it('ACE-71: outro /64 tem cota própria', async () => {
    const entrar = bindingPorChave(1);
    const { pedir } = montar(entrar);
    await pedir('/sessao/entrar', { headers: { 'cf-connecting-ip': '2001:db8:1:2::1' } });
    const outro = await pedir('/sessao/entrar', {
      headers: { 'cf-connecting-ip': '2001:db8:1:3::1' },
    });
    expect(outro.status).not.toBe(429);
    expect(entrar.chaves[0]).not.toBe(entrar.chaves[1]);
  });

  it('ACE-71: IPv4 usa o endereço inteiro; dois IPv4 vizinhos não dividem a cota', async () => {
    const entrar = bindingPorChave(1);
    const { pedir } = montar(entrar);
    await pedir('/sessao/entrar', { headers: { 'cf-connecting-ip': '203.0.113.7' } });
    const vizinho = await pedir('/sessao/entrar', {
      headers: { 'cf-connecting-ip': '203.0.113.8' },
    });
    expect(vizinho.status).not.toBe(429);
    expect(entrar.chaves).toEqual(['203.0.113.7', '203.0.113.8']);
  });

  it('ACE-71: sem cf-connecting-ip, ou com valor que não é IP, a chave é sem-ip', async () => {
    const entrar = bindingPorChave(10);
    const { pedir } = montar(entrar);
    await pedir('/sessao/entrar');
    await pedir('/sessao/entrar', { headers: { 'cf-connecting-ip': 'nao-e-ip' } });
    expect(entrar.chaves).toEqual(['sem-ip', 'sem-ip']);
  });
});
