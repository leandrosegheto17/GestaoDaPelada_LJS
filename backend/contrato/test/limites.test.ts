// Crit�rio: FUN-30 (limites de entrada usados pelos campos do front). Copiado do legado: backend/contrato/test/limites.test.ts

import { describe, expect, it } from 'vitest';
import { LIMITES, bytesUtf8 } from '../src/index';

describe('limite da pontuação inicial', () => {
  it('vai de 0 a 9999', () => {
    expect(LIMITES.pontuacaoInicial).toEqual({ min: 0, max: 9999 });
  });
});

describe('limite de senha em bytes', () => {
  it('72 caracteres ASCII cabem em 72 bytes', () => {
    expect(bytesUtf8('a'.repeat(72))).toBeLessThanOrEqual(LIMITES.senha.bytesMax);
  });
  it('72 caracteres multibyte estouram os 72 bytes', () => {
    expect(bytesUtf8('ç'.repeat(72))).toBeGreaterThan(LIMITES.senha.bytesMax);
  });
});

describe('dias da semana', () => {
  it('começam no domingo, como Date#getUTCDay', async () => {
    const { DIAS_DA_SEMANA } = await import('../src/index');
    expect(DIAS_DA_SEMANA).toHaveLength(7);
    expect(DIAS_DA_SEMANA[0]).toBe('domingo');
    expect(DIAS_DA_SEMANA[6]).toBe('sabado');
  });
});
