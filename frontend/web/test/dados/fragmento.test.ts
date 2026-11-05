import { afterEach, describe, expect, it, vi } from 'vitest';
import { lerTokenDoFragmento } from '../../src/dados/fragmento.ts';

/** 32 bytes em base64url, sem preenchimento: 43 caracteres. */
const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234';

function irPara(url: string) {
  window.history.replaceState(null, '', url);
}

afterEach(() => {
  irPara('/');
  vi.restoreAllMocks();
});

describe('lerTokenDoFragmento', () => {
  it('ACE-06: devolve o token e, depois da leitura, location.hash está vazio', () => {
    expect(TOKEN).toHaveLength(43);
    irPara(`/confirmar?x=1#t=${TOKEN}`);
    const tamanhoAntes = window.history.length;
    expect(lerTokenDoFragmento()).toBe(TOKEN);
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/confirmar');
    expect(window.location.search).toBe('?x=1');
    // replaceState: o link com o token não fica no histórico.
    expect(window.history.length).toBe(tamanhoAntes);
  });

  it('ACE-24: a leitura acontece uma vez; a segunda devolve nulo', () => {
    irPara(`/nova-senha#t=${TOKEN}`);
    expect(lerTokenDoFragmento()).toBe(TOKEN);
    expect(lerTokenDoFragmento()).toBeNull();
  });

  it('sem #t=, devolve nulo e não mexe na barra', () => {
    irPara('/confirmar#outra=1');
    const replace = vi.spyOn(window.history, 'replaceState');
    expect(lerTokenDoFragmento()).toBeNull();
    expect(window.location.hash).toBe('#outra=1');
    expect(replace).not.toHaveBeenCalled();

    irPara('/confirmar');
    expect(lerTokenDoFragmento()).toBeNull();
  });

  for (const [nome, valor] of [
    ['curto', TOKEN.slice(1)],
    ['longo', `${TOKEN}a`],
    ['com caractere fora do base64url', `${TOKEN.slice(1)}+`],
    ['vazio', ''],
  ] as const) {
    it(`token malformado (${nome}) devolve nulo e também sai da barra`, () => {
      irPara(`/confirmar#t=${valor}`);
      expect(lerTokenDoFragmento()).toBeNull();
      expect(window.location.hash).toBe('');
    });
  }
});
