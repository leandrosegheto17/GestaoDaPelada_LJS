import { describe, expect, it } from 'vitest';
import {
  emailAvisoCadastro,
  emailConfirmacao,
  emailConvite,
  emailRecuperacao,
  escaparHtml,
  montarLink,
} from '../../src/infraestrutura/email/modelos.ts';

/** Modelos dos e-mails de conta (T16; ACE-04, ACE-23, ACE-31). */

const URL = 'https://app.exemplo.test';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

/** Os links (href) do HTML e as URLs do texto. */
function links(conteudo: { texto: string; html: string }): string[] {
  const doHtml = [...conteudo.html.matchAll(/href="([^"]+)"/g)].map((m) =>
    (m[1] ?? '').replace(/&amp;/g, '&'),
  );
  const doTexto = [...conteudo.texto.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
  return [...doHtml, ...doTexto];
}

describe('montarLink', () => {
  it('ACE-23: começa por URL_PUBLICA e leva o token só depois de #t=', () => {
    const link = montarLink(`${URL}/`, '/entrar/nova-senha', TOKEN);
    expect(link).toBe(`${URL}/entrar/nova-senha#t=${TOKEN}`);
    expect(link.split('#')[0]).not.toContain(TOKEN);
  });

  it('ACE-23: sem URL_PUBLICA (vazia ou relativa), recusa montar o link', () => {
    expect(() => montarLink('', '/confirmar', TOKEN)).toThrow(/URL_PUBLICA/);
    expect(() => montarLink('/app', '/confirmar', TOKEN)).toThrow(/URL_PUBLICA/);
  });
});

describe('modelos', () => {
  it('ACE-06: a confirmação leva a /confirmar#t= em texto e HTML', () => {
    const c = emailConfirmacao({ urlPublica: URL, nome: 'Ana', token: TOKEN });
    expect(links(c)).toEqual([`${URL}/confirmar#t=${TOKEN}`, `${URL}/confirmar#t=${TOKEN}`]);
  });

  it('ACE-23: a recuperação leva a /entrar/nova-senha#t= e o token não aparece fora do fragmento', () => {
    const c = emailRecuperacao({ urlPublica: URL, nome: 'Ana', token: TOKEN });
    for (const l of links(c)) {
      expect(l.startsWith(URL)).toBe(true);
      expect(l).toBe(`${URL}/entrar/nova-senha#t=${TOKEN}`);
    }
    expect(c.texto.split(TOKEN)).toHaveLength(2);
  });

  it('ACE-31: o convite traz o nome do grupo e o link /convite#t=', () => {
    const c = emailConvite({ urlPublica: URL, grupoNome: 'Pelada de Sábado', token: TOKEN });
    expect(c.assunto).toContain('Pelada de Sábado');
    expect(c.texto).toContain('Pelada de Sábado');
    expect(c.html).toContain('Pelada de Sábado');
    expect(links(c)).toContain(`${URL}/convite#t=${TOKEN}`);
  });

  it('ACE-04: o aviso de cadastro duplicado não tem link de confirmação nem token', () => {
    const c = emailAvisoCadastro({ urlPublica: URL, nome: 'Ana' });
    for (const l of links(c)) {
      expect(l).not.toContain('/confirmar');
      expect(l).not.toContain('#t=');
    }
    expect(links(c)).toContain(`${URL}/entrar/esqueci`);
  });

  it('ACE-31: nome do grupo e nome da pessoa são escapados no HTML', () => {
    const c = emailConvite({
      urlPublica: URL,
      grupoNome: '<script>alert(1)</script>',
      token: TOKEN,
    });
    expect(c.html).not.toContain('<script>');
    expect(c.html).toContain('&lt;script&gt;');
    const r = emailRecuperacao({ urlPublica: URL, nome: 'Ana "<b>"', token: TOKEN });
    expect(r.html).not.toContain('<b>');
  });

  it('ACE-23: escaparHtml troca os 5 caracteres especiais', () => {
    expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
