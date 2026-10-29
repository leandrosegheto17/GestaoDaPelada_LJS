// ADR-032: as variáveis do Neon (NEON_URL_MIGRACAO, NEON_URL_DEV) e DATABASE_URL só para o banco local.
import { describe, expect, it } from 'vitest';
import { conferirAlvoNeon, UrlDoAlvoAusente, urlDoAlvo, VARIAVEL_DO_ALVO } from '../comum/alvo-neon.ts';

const AMBIENTE = { DATABASE_URL: 'local', NEON_URL_MIGRACAO: 'main', NEON_URL_DEV: 'dev', NEON_URL_BACKUP: 'backup' };

describe('urlDoAlvo', () => {
  it('cada alvo tem a sua variável', () => {
    expect(VARIAVEL_DO_ALVO).toEqual({ producao: 'NEON_URL_MIGRACAO', teste: 'NEON_URL_DEV' });
  });

  it.each([
    ['producao', 'main'],
    ['teste', 'dev'],
    [undefined, 'local'],
  ])('--alvo %s lê %s', (alvo, esperado) => {
    expect(urlDoAlvo(alvo, AMBIENTE)).toBe(esperado);
  });

  it('com --alvo, nunca cai para DATABASE_URL', () => {
    expect(urlDoAlvo('producao', { DATABASE_URL: 'local' })).toBeUndefined();
    expect(urlDoAlvo('teste', { DATABASE_URL: 'local' })).toBeUndefined();
  });

  it('alvo desconhecido fica no banco local (a trava de host recusa o remoto)', () => {
    expect(urlDoAlvo('outro', AMBIENTE)).toBe('local');
  });
});

describe('conferirAlvoNeon', () => {
  it.each([
    ['producao', 'NEON_URL_MIGRACAO'],
    ['teste', 'NEON_URL_DEV'],
  ])('--alvo %s sem a variável diz para definir %s', (alvo, variavel) => {
    expect(() => conferirAlvoNeon(undefined, alvo)).toThrow(UrlDoAlvoAusente);
    expect(() => conferirAlvoNeon('', alvo)).toThrow(`Defina ${variavel}`);
  });

  it('sem --alvo não confere nada (a trava de host cuida do local)', () => {
    expect(() => conferirAlvoNeon(undefined, undefined)).not.toThrow();
  });
});
