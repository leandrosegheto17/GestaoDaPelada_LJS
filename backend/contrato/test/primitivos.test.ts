// Critérios: ACE-03 (limites), ACE-05 (e-mail normalizado), ACE-68 (senha em bytes).
import { describe, expect, it } from 'vitest';
import { email, nomeConta, senha } from '../src/primitivos';

describe('email', () => {
  it('normaliza para minúsculas e sem espaços nas pontas (ACE-05)', () => {
    expect(email.parse(' Leandro@Ex.com ')).toBe('leandro@ex.com');
  });
  it('aceita 254 caracteres e recusa 255 (ACE-03)', () => {
    const com = (n: number) => 'a'.repeat(n - '@ex.com'.length) + '@ex.com';
    expect(email.safeParse(com(254)).success).toBe(true);
    expect(com(255)).toHaveLength(255);
    expect(email.safeParse(com(255)).success).toBe(false);
  });
  it('recusa texto que não é e-mail (ACE-03)', () => {
    expect(email.safeParse('sem-arroba').success).toBe(false);
  });
});

describe('senha', () => {
  it('recusa 7 caracteres e aceita 8 (ACE-68)', () => {
    expect(senha.safeParse('a'.repeat(7)).success).toBe(false);
    expect(senha.safeParse('a'.repeat(8)).success).toBe(true);
  });
  it('aceita 72 caracteres e recusa 73 (ACE-68)', () => {
    expect(senha.safeParse('a'.repeat(72)).success).toBe(true);
    expect(senha.safeParse('a'.repeat(73)).success).toBe(false);
  });
  it('recusa 20 emojis, que passam de 72 bytes (ACE-68)', () => {
    expect(senha.safeParse('😀'.repeat(20)).success).toBe(false);
  });
  it('recusa acentuados que somam mais de 72 bytes com menos de 72 caracteres (ACE-68)', () => {
    expect(senha.safeParse('ç'.repeat(40)).success).toBe(false);
  });
});

describe('nomeConta', () => {
  it('aceita de 2 a 60 caracteres e recusa fora disso (ACE-03)', () => {
    expect(nomeConta.safeParse('a').success).toBe(false);
    expect(nomeConta.safeParse('ab').success).toBe(true);
    expect(nomeConta.safeParse('a'.repeat(60)).success).toBe(true);
    expect(nomeConta.safeParse('a'.repeat(61)).success).toBe(false);
  });
});
