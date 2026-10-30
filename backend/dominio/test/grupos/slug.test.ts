// Critérios: GEL-11 (base do slug), GEL-12 (mínimo `grupo`), GEL-13 (reservadas viram `<base>-grupo`).
// Casos copiados do legado (`backend/dominio/test/grupos/slug.test.ts`), sem `gerarSlug`: o sufixo é do banco.
import { describe, expect, it } from 'vitest';
import { slugBase } from '../../src/index.ts';

describe('slugBase: base a partir do nome (GEL-11)', () => {
  it.each([
    ['Pelada de Quinta', 'pelada-de-quinta'],
    ['Racha de Domingo', 'racha-de-domingo'],
    ['Fúria São João Ação', 'furia-sao-joao-acao'],
    ['Maçã Çedilha', 'maca-cedilha'],
    ['⚽ Pelada 🔥!!', 'pelada'],
    ['  --Futebol__Amigos--  ', 'futebol-amigos'],
    ['Time 2026', 'time-2026'],
    ['../etc/passwd', 'etc-passwd'],
    ['%2F%2e%2e', '2f-2e-2e'],
    ['Pe​la​da', 'pe-la-da'],
    ['PELADA', 'pelada'],
  ])('%j → %s', (nome, esperado) => {
    expect(slugBase(nome)).toBe(esperado);
  });

  it('corta em 40 caracteres sem deixar hífen no fim', () => {
    expect(slugBase(`${'a'.repeat(39)} bbbbbbbbbb`)).toBe('a'.repeat(39));
    expect(slugBase('a'.repeat(100))).toBe('a'.repeat(40));
    expect(slugBase(`${'a'.repeat(40)}b`)).toBe('a'.repeat(40));
  });

  it('a saída sempre casa com o formato público', () => {
    const pedacos = ['Pelada', 'ção', '⚽', ' ', '--', 'Zé', '_', 'A1', '日本', 'ñ'];
    for (let i = 0; i < 200; i++) {
      const nome = Array.from({ length: 1 + (i % 8) }, (_, k) => pedacos[(i * 7 + k * 3) % pedacos.length]).join('');
      const slug = slugBase(nome);
      expect(slug).toMatch(/^[a-z0-9-]{3,46}$/);
      expect(slug).not.toContain('--');
      expect(slug.startsWith('-') || slug.endsWith('-')).toBe(false);
    }
  });
});

describe('slugBase: base curta vira `grupo` (GEL-12)', () => {
  it.each([
    ['!!!', 'grupo'],
    ['AB', 'grupo'],
    ['ab', 'grupo'],
    ['', 'grupo'],
    ['   ', 'grupo'],
    ['⚽🔥!!!', 'grupo'],
    ['Пелада', 'grupo'],
    ['足球', 'grupo'],
    ['--x--', 'grupo'],
    ['g', 'grupo'],
  ])('%j → %s', (nome, esperado) => {
    expect(slugBase(nome)).toBe(esperado);
  });

  it('três caracteres já bastam; dois não', () => {
    expect(slugBase('abc')).toBe('abc');
    expect(slugBase('Zé!')).toBe('grupo');
    expect(slugBase('Zéu')).toBe('zeu');
  });
});

describe('slugBase: palavras reservadas (GEL-13)', () => {
  it.each([
    ['Admin', 'admin-grupo'],
    ['API', 'api-grupo'],
    ['Dono', 'dono-grupo'],
    ['Entrar', 'entrar-grupo'],
    ['Privacidade', 'privacidade-grupo'],
    ['Conta', 'conta-grupo'],
    ['Assets', 'assets-grupo'],
    ['Well Known', 'well-known-grupo'],
    ['well-known', 'well-known-grupo'],
  ])('%j → %s', (nome, esperado) => {
    expect(slugBase(nome)).toBe(esperado);
  });

  it('`g` é reservada, mas fica curta antes: vira `grupo`', () => {
    expect(slugBase('G')).toBe('grupo');
  });

  it('palavra que só contém uma reservada não muda', () => {
    expect(slugBase('Admins')).toBe('admins');
    expect(slugBase('Conta Corrente')).toBe('conta-corrente');
  });
});
