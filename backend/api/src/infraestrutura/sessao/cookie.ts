import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

/**
 * Cookie de sessão (T14; ACE-09, ACE-17): `__Host-sessao`, `HttpOnly; Secure; SameSite=Lax;
 * Path=/` e sem `Domain` (o prefixo `__Host-` exige os três últimos). Dura as 12 h absolutas da
 * sessão; o banco é quem decide se ela ainda vale (15 min de inatividade, ACE-15).
 */

export const NOME_COOKIE_SESSAO = '__Host-sessao';

/** As 12 h absolutas da sessão, em segundos (ACE-16). */
export const DURACAO_SESSAO_S = 12 * 60 * 60;

const ATRIBUTOS = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/',
} as const;

/** Grava o cookie com o token da sessão nova. */
export function definirCookieSessao(c: Context, token: string): void {
  setCookie(c, NOME_COOKIE_SESSAO, token, { ...ATRIBUTOS, maxAge: DURACAO_SESSAO_S });
}

/** Vence o cookie no sair: mesmo nome e caminho, valor vazio e `Max-Age=0` (ACE-17). */
export function vencerCookieSessao(c: Context): void {
  setCookie(c, NOME_COOKIE_SESSAO, '', { ...ATRIBUTOS, maxAge: 0, expires: new Date(0) });
}

/** O token do cookie da requisição, ou nulo. */
export function lerCookieSessao(c: Context): string | null {
  const valor = getCookie(c, NOME_COOKIE_SESSAO);
  return valor ? valor : null;
}
