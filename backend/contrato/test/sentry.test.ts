import { describe, expect, it } from 'vitest';
import { EMAIL_REMOVIDO, limparEvento } from '../src/sentry.ts';

/** Evento no formato do Sentry, com tudo o que precisa sair (FUN-24). */
function eventoSujo() {
  return {
    event_id: 'abc123',
    release: 'sha-1',
    message: 'Falha ao convidar fulana@exemplo.com.br para o grupo',
    request: {
      url: 'https://app.test/api/convites',
      method: 'POST',
      data: { email: 'fulana@exemplo.com.br', senha: 'segredo' },
      cookies: { sessao: 'cookie-de-sessao' },
      headers: {
        Cookie: 'sessao=cookie-de-sessao',
        Authorization: 'Bearer token-secreto',
        'set-cookie': 'sessao=outro',
        'User-Agent': 'navegador',
      },
    },
    exception: { values: [{ type: 'Error', value: 'conta beltrano@exemplo.org não existe' }] },
    breadcrumbs: [
      { category: 'console', message: 'login de ciclano@exemplo.net' },
      {
        category: 'fetch',
        data: { url: '/api/x', corpo: 'para: joao.silva+pelada@mail.exemplo.com' },
      },
    ],
    extra: {
      contato: 'maria@exemplo.com',
      lista: ['ana@exemplo.com', 'sem email'],
      aninhado: { e: 'x@y.io' },
    },
  };
}

describe('limparEvento', () => {
  it('FUN-24: evento com corpo, cookie, authorization e um e-mail na mensagem sai sem nenhum deles', () => {
    const limpo = limparEvento(eventoSujo());
    const texto = JSON.stringify(limpo);
    expect(limpo.request).not.toHaveProperty('data');
    expect(limpo.request).not.toHaveProperty('cookies');
    expect(Object.keys(limpo.request.headers).map((h) => h.toLowerCase())).toEqual(['user-agent']);
    expect(limpo.message).toBe(`Falha ao convidar ${EMAIL_REMOVIDO} para o grupo`);
    for (const trecho of [
      'segredo',
      'cookie-de-sessao',
      'token-secreto',
      'sessao=outro',
      'fulana@',
      '@exemplo',
    ]) {
      expect(texto).not.toContain(trecho);
    }
    // O que não é dado pessoal fica.
    expect(limpo.request.url).toBe('https://app.test/api/convites');
    expect(limpo.request.method).toBe('POST');
    expect(limpo.release).toBe('sha-1');
  });

  it('FUN-24: o evento sem esses campos não muda', () => {
    const limpo = {
      event_id: 'e1',
      release: 'sha-2',
      message: 'Falha ao listar grupos',
      request: {
        url: 'https://app.test/api/grupos',
        method: 'GET',
        headers: { 'User-Agent': 'x' },
      },
      exception: { values: [{ type: 'TypeError', value: 'x is undefined' }] },
      breadcrumbs: [{ category: 'console', message: 'ok' }],
      extra: { tentativa: 2, ativo: true, nada: null },
      tags: { versao: 'sha-2' },
    };
    const copia = structuredClone(limpo);
    expect(limparEvento(limpo)).toEqual(copia);
  });

  it('FUN-24: e-mail dentro de breadcrumb e de extra também é removido', () => {
    const limpo = limparEvento(eventoSujo());
    expect(limpo.breadcrumbs[0]?.message).toBe(`login de ${EMAIL_REMOVIDO}`);
    expect(limpo.breadcrumbs[1]?.data?.corpo).toBe(`para: ${EMAIL_REMOVIDO}`);
    expect(limpo.extra.contato).toBe(EMAIL_REMOVIDO);
    expect(limpo.extra.lista).toEqual([EMAIL_REMOVIDO, 'sem email']);
    expect(limpo.extra.aninhado.e).toBe(EMAIL_REMOVIDO);
    expect(limpo.exception.values[0]?.value).toBe(`conta ${EMAIL_REMOVIDO} não existe`);
  });

  it('FUN-24: o e-mail do usuário do evento também sai', () => {
    const limpo = limparEvento({ user: { id: 'u1', email: 'pessoa@exemplo.com' } });
    expect(limpo.user.email).toBe(EMAIL_REMOVIDO);
    expect(limpo.user.id).toBe('u1');
  });

  it('FUN-24: cabeçalhos removidos em qualquer caixa', () => {
    const limpo = limparEvento({
      request: { headers: { COOKIE: 'a', authorization: 'b', 'Set-Cookie': 'c', Accept: 'json' } },
    });
    expect(limpo.request.headers).toEqual({ Accept: 'json' });
  });

  it('FUN-24: o evento de entrada não é alterado', () => {
    const sujo = eventoSujo();
    const antes = structuredClone(sujo);
    limparEvento(sujo);
    expect(sujo).toEqual(antes);
  });
});
