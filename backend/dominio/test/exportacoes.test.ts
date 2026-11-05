import { describe, expect, it } from 'vitest';
import * as dominio from '../src/index.ts';

describe('exportações do domínio de grupos e elenco', () => {
  it.each([
    'slugBase',
    'chaveBusca',
    'compararApelido',
    'calcularNivel',
    'HABILIDADES_INICIAIS',
    'anoNascimentoMaximo',
    'avaliarPeriodos',
    'avaliarInicio',
    'formatarData',
  ])('GEL-70, GEL-104: o index.ts exporta %s', (nome) => {
    expect((dominio as Record<string, unknown>)[nome]).toBeDefined();
  });
});
