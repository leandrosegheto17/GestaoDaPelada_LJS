import { afterEach, describe, expect, it } from 'vitest';
import { lerTokenDoFragmento } from './fragmento';

afterEach(() => history.replaceState(null, '', '/'));

describe('lerTokenDoFragmento (AD-010)', () => {
  it('com #t=abc devolve abc e a URL fica sem fragmento', () => {
    history.replaceState(null, '', '/confirmar?x=1#t=abc');
    expect(lerTokenDoFragmento()).toBe('abc');
    expect(location.hash).toBe('');
    expect(location.pathname + location.search).toBe('/confirmar?x=1');
    expect(location.href.includes('#')).toBe(false);
  });

  it('sem fragmento devolve nulo e não mexe na URL', () => {
    history.replaceState(null, '', '/confirmar?x=1');
    expect(lerTokenDoFragmento()).toBeNull();
    expect(location.pathname + location.search).toBe('/confirmar?x=1');
  });

  it('fragmento sem t devolve nulo e não apaga o fragmento', () => {
    history.replaceState(null, '', '/confirmar#outro=1');
    expect(lerTokenDoFragmento()).toBeNull();
    expect(location.hash).toBe('#outro=1');
  });

  it('t vazio devolve nulo e apaga o fragmento', () => {
    history.replaceState(null, '', '/confirmar#t=');
    expect(lerTokenDoFragmento()).toBeNull();
    expect(location.hash).toBe('');
  });

  it('token com caracteres de base64url sai inteiro', () => {
    history.replaceState(null, '', '/convite#t=A-b_9Zz');
    expect(lerTokenDoFragmento()).toBe('A-b_9Zz');
  });

  it('a segunda leitura não acha mais o token', () => {
    history.replaceState(null, '', '/confirmar#t=abc');
    lerTokenDoFragmento();
    expect(lerTokenDoFragmento()).toBeNull();
  });
});
