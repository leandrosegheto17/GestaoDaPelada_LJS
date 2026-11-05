import { describe, expect, it } from 'vitest';
import { slugBase, SLUGS_RESERVADOS } from '../../src/grupos/slug.ts';

describe('slugBase', () => {
  it('GEL-11: "Pelada de Quinta" vira pelada-de-quinta', () => {
    expect(slugBase('Pelada de Quinta')).toBe('pelada-de-quinta');
  });

  it('GEL-11: "Açaí & Cia" vira acai-cia (acento tirado, sequência de símbolos vira um hífen)', () => {
    expect(slugBase('Açaí & Cia')).toBe('acai-cia');
  });

  it('GEL-11: hífens e espaços nas pontas somem', () => {
    expect(slugBase('  --Racha do Zé!--  ')).toBe('racha-do-ze');
  });

  it('GEL-11: nome de 50 letras é cortado em 40', () => {
    const nome = 'a'.repeat(50);
    expect(slugBase(nome)).toBe('a'.repeat(40));
  });

  it('GEL-11: o corte em 40 não deixa hífen final', () => {
    // 39 letras, um espaço (vira hífen na posição 40) e mais letras.
    const nome = `${'b'.repeat(39)} ${'c'.repeat(10)}`;
    const slug = slugBase(nome);
    expect(slug).toBe('b'.repeat(39));
    expect(slug.endsWith('-')).toBe(false);
  });

  it('GEL-11: números ficam', () => {
    expect(slugBase('Pelada 2026')).toBe('pelada-2026');
  });

  it.each(['AB', '!!!', 'é', ''])('GEL-12: "%s" vira grupo', (nome) => {
    expect(slugBase(nome)).toBe('grupo');
  });

  it.each(SLUGS_RESERVADOS.filter((r) => r.length >= 3))('GEL-13: a reservada "%s" vira <base>-grupo', (reservada) => {
    expect(slugBase(reservada)).toBe(`${reservada}-grupo`);
  });

  it('GEL-13: "Admin" vira admin-grupo e "Well Known" vira well-known-grupo', () => {
    expect(slugBase('Admin')).toBe('admin-grupo');
    expect(slugBase('Well Known')).toBe('well-known-grupo');
  });

  it('GEL-12, GEL-13: a reservada "g" tem menos de 3 caracteres e vira grupo (GEL-12 vem antes na spec)', () => {
    expect(slugBase('G')).toBe('grupo');
  });

  it('GEL-13: a lista tem as 9 reservadas da spec', () => {
    expect([...SLUGS_RESERVADOS].sort()).toEqual(
      ['admin', 'api', 'assets', 'conta', 'dono', 'entrar', 'g', 'privacidade', 'well-known'].sort(),
    );
  });
});
