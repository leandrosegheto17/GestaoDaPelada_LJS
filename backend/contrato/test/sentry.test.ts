import { describe, expect, test } from 'vitest';
import { limparEvento } from '../src/sentry.ts';

const EMAIL = 'maria.souza+pelada@exemplo.com.br';

describe('limparEvento', () => {
  test('FUN-24: tira corpo, cookies, authorization e o e-mail da mensagem', () => {
    const limpo = limparEvento({
      message: `falha ao entrar com ${EMAIL}`,
      request: {
        url: 'https://app.test/api/entrar',
        method: 'POST',
        data: { email: EMAIL, senha: 'segredo' },
        cookies: { sessao: 'abc' },
        headers: {
          Cookie: 'sessao=abc',
          Authorization: 'Bearer xyz',
          'user-agent': 'teste',
        },
      },
    });
    const texto = JSON.stringify(limpo);
    for (const proibido of [EMAIL, 'segredo', 'sessao=abc', 'Bearer xyz', '"abc"']) {
      expect(texto, proibido).not.toContain(proibido);
    }
    expect(limpo.request).toMatchObject({ url: 'https://app.test/api/entrar', method: 'POST' });
    expect(limpo.request?.headers).toEqual({ 'user-agent': 'teste' });
  });

  test('FUN-24: cabeçalhos cookie e authorization saem em qualquer caixa', () => {
    const limpo = limparEvento({
      request: {
        headers: { cookie: 'a=1', AUTHORIZATION: 'x', 'Set-Cookie': 'b=2', Accept: '*/*' },
      },
    });
    expect(Object.keys(limpo.request?.headers ?? {})).toEqual(['Accept']);
  });

  test('FUN-24: o evento sem esses campos não muda', () => {
    const evento = {
      message: 'tudo certo',
      level: 'info',
      release: 'abc1234',
      request: { url: 'https://app.test/api/health', method: 'GET', headers: { accept: '*/*' } },
      tags: { rota: '/api/health' },
    };
    expect(limparEvento(evento)).toEqual(evento);
  });

  test('FUN-24: e-mail em breadcrumb, extra, exceção e usuário também é removido', () => {
    const limpo = limparEvento({
      breadcrumbs: [
        { message: `convite para ${EMAIL}`, data: { para: EMAIL } },
        { message: 'sem dado pessoal' },
      ],
      extra: { contato: `fale com ${EMAIL} hoje`, aninhado: { lista: [EMAIL, 1, null] } },
      exception: { values: [{ type: 'Error', value: `inválido: ${EMAIL}` }] },
      user: { id: 'u1', email: EMAIL },
    });
    const texto = JSON.stringify(limpo);
    expect(texto).not.toContain(EMAIL);
    expect(texto).not.toContain('@exemplo');
    expect(limpo.breadcrumbs?.[1]).toEqual({ message: 'sem dado pessoal' });
    expect(limpo.user?.id).toBe('u1');
  });

  test('FUN-24: não altera o evento recebido', () => {
    const evento = { message: EMAIL, request: { data: 'x', headers: { cookie: 'a' } } };
    const copia = structuredClone(evento);
    limparEvento(evento);
    expect(evento).toEqual(copia);
  });
});
