import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  definirCookieSessao,
  DURACAO_SESSAO_S,
  lerCookieSessao,
  NOME_COOKIE_SESSAO,
  vencerCookieSessao,
} from '../../src/infraestrutura/sessao/cookie.ts';

/** Cookie de sessão (T14; ACE-09, ACE-17). */

const TOKEN = 'A'.repeat(42) + 'b';

function app(): Hono {
  const a = new Hono();
  a.post('/entrar', (c) => {
    definirCookieSessao(c, TOKEN);
    return c.body(null, 204);
  });
  a.post('/sair', (c) => {
    vencerCookieSessao(c);
    return c.body(null, 204);
  });
  a.get('/ler', (c) => c.json({ token: lerCookieSessao(c) }));
  return a;
}

/** Atributos do Set-Cookie, em minúsculas, sem o par nome=valor. */
function atributos(setCookie: string): string[] {
  return setCookie
    .split(';')
    .slice(1)
    .map((a) => a.trim().toLowerCase());
}

describe('definirCookieSessao', () => {
  it('ACE-09: o Set-Cookie é __Host-sessao com o token e os 4 atributos', async () => {
    const r = await app().request('/entrar', { method: 'POST' });
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie.startsWith(`${NOME_COOKIE_SESSAO}=${TOKEN};`)).toBe(true);
    const a = atributos(cookie);
    expect(a).toContain('httponly');
    expect(a).toContain('secure');
    expect(a).toContain('samesite=lax');
    expect(a).toContain('path=/');
  });

  it('ACE-09: o Set-Cookie não tem Domain', async () => {
    const r = await app().request('/entrar', { method: 'POST' });
    expect(atributos(r.headers.get('set-cookie') ?? '').some((a) => a.startsWith('domain'))).toBe(false);
  });

  it('ACE-16: o cookie dura as 12 h da sessão', async () => {
    const r = await app().request('/entrar', { method: 'POST' });
    expect(atributos(r.headers.get('set-cookie') ?? '')).toContain(`max-age=${DURACAO_SESSAO_S}`);
    expect(DURACAO_SESSAO_S).toBe(43_200);
  });
});

describe('vencerCookieSessao', () => {
  it('ACE-17: o cookie vencido tem Max-Age=0, valor vazio, o mesmo nome e o mesmo caminho', async () => {
    const r = await app().request('/sair', { method: 'POST' });
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie.startsWith(`${NOME_COOKIE_SESSAO}=;`)).toBe(true);
    const a = atributos(cookie);
    expect(a).toContain('max-age=0');
    expect(a).toContain('path=/');
    expect(a).toContain('secure');
    expect(a).toContain('httponly');
    expect(a.some((x) => x.startsWith('domain'))).toBe(false);
  });
});

describe('lerCookieSessao', () => {
  it('ACE-09: lê o token do cookie da requisição', async () => {
    const r = await app().request('/ler', { headers: { cookie: `outro=1; ${NOME_COOKIE_SESSAO}=${TOKEN}` } });
    expect(await r.json()).toEqual({ token: TOKEN });
  });

  it('ACE-18: sem o cookie, ou com ele vazio, devolve nulo', async () => {
    expect(await (await app().request('/ler')).json()).toEqual({ token: null });
    expect(await (await app().request('/ler', { headers: { cookie: `${NOME_COOKIE_SESSAO}=` } })).json()).toEqual({ token: null });
  });

  it('ACE-09: cookie com outro nome (sessao, sem o prefixo) não vale', async () => {
    const r = await app().request('/ler', { headers: { cookie: `sessao=${TOKEN}` } });
    expect(await r.json()).toEqual({ token: null });
  });
});
