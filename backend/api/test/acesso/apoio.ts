import { createHash } from 'node:crypto';
import type { Env, LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { caixaDev } from '../../src/infraestrutura/email/caixa-dev.ts';
import type { Mensagem } from '../../src/infraestrutura/email/resend.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';

/**
 * Apoio dos testes das rotas de acesso (T25 a T30). Rodam no Node (projeto `banco` do Vitest),
 * como o teste do `comBanco` da fundação, porque precisam do Postgres local: o app é o
 * `criarApp` real, com o banco como `pelada_app`, `EMAIL_DEV=1` (e-mails na caixa em memória)
 * e os limitadores liberados.
 *
 * SPEC_DEVIATION: a Test Coverage Matrix põe as rotas no pool `workerd`; o pool não tem o
 * Postgres, então elas ficam no Node, como `test/db/com-banco.test.ts` da fundação.
 */

export const URL_PUBLICA_TESTE = 'https://pelada.exemplo.test';

const permite: LimiteDeTaxa = { limit: async () => ({ success: true }) };

export function envAcesso(url: string, extra: Partial<Env> = {}): Env {
  return {
    VERSAO: 'v',
    URL_PUBLICA: URL_PUBLICA_TESTE,
    EMAIL_DEV: '1',
    LIMITE_EMAILS_DIA: '100',
    HYPERDRIVE: { connectionString: url },
    LIMITE_ENTRAR: permite,
    LIMITE_PUBLICO: permite,
    LIMITE_WEBHOOK: permite,
    LIMITE_ESCRITA: permite,
    ...extra,
  } as unknown as Env;
}

export interface Pedido {
  metodo?: string;
  corpo?: unknown;
  /** Token do cookie `__Host-sessao`. */
  sessao?: string | null;
  ip?: string;
  /** Corpo cru, para testar JSON inválido. */
  cru?: string;
}

export function cliente(url: string, extraEnv: Partial<Env> = {}) {
  const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica });
  return async (caminho: string, p: Pedido = {}): Promise<Response> => {
    const headers = new Headers({ 'x-pelada': '1', 'cf-connecting-ip': p.ip ?? '203.0.113.50' });
    if (p.sessao) headers.set('cookie', `${NOME_COOKIE_SESSAO}=${p.sessao}`);
    let body: string | undefined;
    if (p.cru !== undefined) body = p.cru;
    else if (p.corpo !== undefined) body = JSON.stringify(p.corpo);
    if (body !== undefined) headers.set('content-type', 'application/json');
    const ctx = contextoFalso();
    const r = await app.request(
      `/api${caminho}`,
      { method: p.metodo ?? (body !== undefined ? 'POST' : 'GET'), headers, ...(body !== undefined ? { body } : {}) },
      envAcesso(url, extraEnv),
      ctx,
    );
    await ctx.esperar();
    return r;
  };
}

/** Mensagens da caixa de dev para o endereço, do tipo dado (todas se sem tipo). */
export function emailsPara(para: string, tipo?: Mensagem['tipo']): Mensagem[] {
  return caixaDev.mensagens.filter((m) => m.para === para && (tipo === undefined || m.tipo === tipo));
}

/** O token do link `#t=` no texto do e-mail. */
export function tokenDoEmail(m: Mensagem | undefined): string {
  const achado = /#t=([A-Za-z0-9_-]{43})/.exec(m?.texto ?? '');
  if (!achado?.[1]) throw new Error('E-mail sem token');
  return achado[1];
}

/** O token do `Set-Cookie: __Host-sessao=…`, ou nulo. */
export function tokenDoCookie(r: Response): string | null {
  const valor = r.headers.get('set-cookie') ?? '';
  const achado = new RegExp(`${NOME_COOKIE_SESSAO}=([^;]*)`).exec(valor);
  return achado?.[1] ? achado[1] : null;
}

/** O `Set-Cookie` venceu o cookie de sessão. */
export function cookieVencido(r: Response): boolean {
  const valor = r.headers.get('set-cookie') ?? '';
  return valor.startsWith(`${NOME_COOKIE_SESSAO}=`) && /max-age=0/i.test(valor);
}

/** SHA-256 do texto do token (o que o banco guarda). */
export function hashDoTexto(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

/** Limpa a caixa de dev (chamar no beforeEach). */
export function limparCaixa(): void {
  caixaDev.limpar();
}
