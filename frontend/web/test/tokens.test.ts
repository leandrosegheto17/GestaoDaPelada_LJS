import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lerToken } from '../config/tokens.ts';

// Critério: FUN-29 (cores só vêm de tokens.css; o código lê o token, não repete o valor).
describe('lerToken (FUN-29)', () => {
  const css = readFileSync(join(import.meta.dirname, '../src/estilos/tokens.css'), 'utf8');

  it('lê o valor de um token existente', () => {
    expect(lerToken('/* --a: 1; */ :root { --cor-x : #123456; }', '--cor-x')).toBe('#123456');
    expect(lerToken(css, '--cor-fundo')).not.toBe('');
  });

  it('falha para token inexistente', () => {
    expect(() => lerToken(css, '--nao-existe')).toThrow('Token não encontrado');
  });
});
