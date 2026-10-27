// Critérios: ACE-09 e G-09 (atributos do cookie), ACE-16 (12 h), ACE-17 (cookie vencido ao sair).
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { definirCookieSessao, lerTokenSessao, limparCookieSessao } from '../../src/infraestrutura/sessao/cookie.ts';

const TOKEN = 'A'.repeat(43);

const app = new Hono();
app.get('/definir', (c) => {
  definirCookieSessao(c, TOKEN);
  return c.body(null, 204);
});
app.get('/limpar', (c) => {
  limparCookieSessao(c);
  return c.body(null, 204);
});
app.get('/ler', (c) => c.json({ token: lerTokenSessao(c) }));

const lerCom = async (cookie: string) =>
  ((await (await app.request('/ler', { headers: { Cookie: cookie } })).json()) as { token: string | null }).token;

describe('definirCookieSessao', () => {
  it('envia __Host-sessao com HttpOnly, Secure, SameSite=Lax e Path=/', async () => {
    const cookie = (await app.request('/definir')).headers.get('Set-Cookie') ?? '';
    expect(cookie.startsWith(`__Host-sessao=${TOKEN};`)).toBe(true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });
  it('não tem Domain e dura 12 h', async () => {
    const cookie = (await app.request('/definir')).headers.get('Set-Cookie') ?? '';
    expect(cookie).not.toMatch(/Domain/i);
    expect(cookie).toContain('Max-Age=43200');
  });
});

describe('limparCookieSessao', () => {
  it('envia o cookie vencido, com os mesmos atributos', async () => {
    const cookie = (await app.request('/limpar')).headers.get('Set-Cookie') ?? '';
    expect(cookie.startsWith('__Host-sessao=;')).toBe(true);
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
  });
});

describe('lerTokenSessao', () => {
  it('devolve o token de formato válido', async () => {
    expect(await lerCom(`__Host-sessao=${TOKEN}`)).toBe(TOKEN);
  });
  it('devolve nulo para token de formato inválido', async () => {
    expect(await lerCom('__Host-sessao=curto')).toBeNull();
  });
  it('devolve nulo quando o cookie vem repetido', async () => {
    expect(await lerCom(`__Host-sessao=${TOKEN}; __Host-sessao=${'B'.repeat(43)}`)).toBeNull();
  });
});
