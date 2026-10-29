// Critério: GEL-02 (habilidades iniciais, nesta ordem).
import { describe, expect, it } from 'vitest';
import { HABILIDADES_INICIAIS } from '../../src/index.ts';

describe('HABILIDADES_INICIAIS (GEL-02)', () => {
  it('é a lista exata, na ordem da spec', () => {
    expect(HABILIDADES_INICIAIS).toEqual(['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme']);
  });
});
