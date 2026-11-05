import { describe, expect, it } from 'vitest';
import { bytesUtf8, email, nome, senha, senhaInformada, token } from '../src/primitivos.ts';

/** Primitivos do contrato (T11; ACE-03, ACE-05, ACE-68). */

const letras = (n: number) => 'a'.repeat(n);

describe('nome', () => {
  it.each([
    [1, false],
    [2, true],
    [60, true],
    [61, false],
  ])('ACE-03: nome de %i caracteres: válido = %s', (n, valido) => {
    expect(nome.safeParse(letras(n)).success).toBe(valido);
  });

  it('ACE-03: espaços nas pontas não contam para o tamanho', () => {
    expect(nome.safeParse('  a ').success).toBe(false);
    expect(nome.parse('  Ana  ')).toBe('Ana');
  });
});

describe('senha', () => {
  it.each([
    [7, false],
    [8, true],
    [72, true],
    [73, false],
  ])('ACE-03: senha de %i caracteres: válida = %s', (n, valida) => {
    expect(senha.safeParse(letras(n)).success).toBe(valida);
  });

  it('ACE-68: senha de 30 emojis (menos de 72 caracteres, mais de 72 bytes) é recusada', () => {
    const emojis = '😀'.repeat(30);
    expect(emojis.length).toBeLessThan(72);
    expect(bytesUtf8(emojis)).toBeGreaterThan(72);
    expect(senha.safeParse(emojis).success).toBe(false);
  });

  it('ACE-68: senha de exatamente 72 bytes com acentos é aceita; 73 bytes não', () => {
    const de72 = 'é'.repeat(36);
    expect(bytesUtf8(de72)).toBe(72);
    expect(senha.safeParse(de72).success).toBe(true);
    expect(senha.safeParse(`${de72}a`).success).toBe(false);
  });

  it('ACE-03: a senha não é cortada nem aparada (espaço conta)', () => {
    expect(senha.parse(' senha com espaço ')).toBe(' senha com espaço ');
  });

  it('ACE-11: a senha informada para conferir aceita qualquer tamanho razoável, mas não vazia', () => {
    expect(senhaInformada.safeParse('curta').success).toBe(true);
    expect(senhaInformada.safeParse('').success).toBe(false);
  });
});

describe('email', () => {
  it('ACE-05: "  Ana@Ex.COM " vira ana@ex.com', () => {
    expect(email.parse('  Ana@Ex.COM ')).toBe('ana@ex.com');
  });

  it('ACE-03: e-mail de 254 caracteres é aceito e o de 255 recusado', () => {
    const dominio = '@exemplo.com';
    const de254 = `${letras(64)}@${letras(63)}.${letras(63)}.${letras(254 - 64 - 1 - 63 - 1 - 63 - 1 - 3)}.br`;
    expect(de254).toHaveLength(254);
    expect(email.safeParse(de254).success).toBe(true);
    expect(email.safeParse(`a${de254}`).success).toBe(false);
    expect(email.safeParse(`ana${dominio}`).success).toBe(true);
  });

  it.each(['', 'sem-arroba', 'a@', '@b.com', 'a b@c.com'])('ACE-03: "%s" não é e-mail', (v) => {
    expect(email.safeParse(v).success).toBe(false);
  });
});

describe('token', () => {
  it('ACE-10: 43 caracteres base64url são aceitos', () => {
    expect(token.safeParse('A'.repeat(42) + '_').success).toBe(true);
  });

  it.each(['A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}=`, `${'A'.repeat(42)}+`, `${'A'.repeat(42)}/`])(
    'ACE-10: "%s" não é token',
    (v) => {
      expect(token.safeParse(v).success).toBe(false);
    },
  );
});
