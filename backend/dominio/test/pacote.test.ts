import { describe, expect, it } from 'vitest';
import pacote from '../package.json' with { type: 'json' };
import * as dominio from '../src/index.ts';

describe('@pelada/dominio (FUN-01)', () => {
  it('é um módulo ESM com o nome do workspace', () => {
    expect(pacote.type).toBe('module');
    expect(pacote.name).toBe('@pelada/dominio');
  });
});

// Critérios: GEL-70 e GEL-104 (as regras da feature ficam em funções puras exportadas pelo domínio).
describe('API pública da grupos-e-elenco', () => {
  it('o pacote aponta para src/index.ts', () => {
    expect(pacote.exports['.']).toBe('./src/index.ts');
  });

  it.each([
    'slugBase',
    'compararApelido',
    'chaveBusca',
    'calcularNivel',
    'anoNascimentoMaximo',
    'avaliarPeriodos',
    'avaliarInicio',
    'formatarData',
  ])('exporta a função %s', (nome) => {
    expect(typeof (dominio as Record<string, unknown>)[nome]).toBe('function');
  });

  it('exporta HABILIDADES_INICIAIS', () => {
    expect(dominio.HABILIDADES_INICIAIS).toHaveLength(6);
  });
});
