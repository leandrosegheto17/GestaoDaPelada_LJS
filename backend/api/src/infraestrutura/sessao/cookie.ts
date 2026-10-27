import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

/** Único lugar que conhece o cookie de sessão: `__Host-sessao`, sem `Domain`, só `Secure` (G-09). */
const NOME = 'sessao';
const NOME_COMPLETO = `__Host-${NOME}`;
/** Duração absoluta da sessão: 12 h (ACE-16). */
const DOZE_HORAS_S = 12 * 60 * 60;
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function definirCookieSessao(c: Context, token: string): void {
  setCookie(c, NOME, token, {
    prefix: 'host',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: DOZE_HORAS_S,
  });
}

export function limparCookieSessao(c: Context): void {
  deleteCookie(c, NOME, { prefix: 'host', httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
}

/** Quantas vezes o cabeçalho `Cookie` bruto traz `__Host-sessao`. */
function contarCookiesSessao(c: Context): number {
  const bruto = c.req.header('Cookie') ?? '';
  return bruto.split(';').filter((par) => par.trim().startsWith(`${NOME_COMPLETO}=`)).length;
}

/**
 * Devolve o token só se tiver o formato gerado pela API (256 bits em base64url); senão `null`.
 * Cookie repetido é recusado: não se escolhe entre valores.
 */
export function lerTokenSessao(c: Context): string | null {
  if (contarCookiesSessao(c) > 1) return null;
  const token = getCookie(c, NOME, 'host');
  return token !== undefined && FORMATO_TOKEN.test(token) ? token : null;
}
