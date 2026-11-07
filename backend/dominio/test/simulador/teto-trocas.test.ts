import { describe, expect, it } from 'vitest';
import { MAX_TROCAS_ACEITAS } from '../../src/simulador/distribuicao-dois.ts';
import { MAX_TROCAS_ACEITAS_VARIOS } from '../../src/simulador/distribuicao-varios.ts';

/**
 * Teto de trocas aceitas (A-03 da validação; SIM-28, SIM-36, SIM-59). O valor é o do legado
 * (`distribuicao-dois.ts:7`, `distribuicao-varios.ts:7`) e a paridade da sugestão com ele (SIM-52) depende dele:
 * os demais testes só exercitam um teto injetado, então sem este um teto trocado passaria em silêncio.
 */
describe('teto de trocas aceitas', () => {
  it('SIM-28: 2 times aceitam no máximo 200 trocas, como o legado', () => {
    expect(MAX_TROCAS_ACEITAS).toBe(200);
  });

  it('SIM-36: 3 ou mais times aceitam no máximo 200 trocas, como o legado', () => {
    expect(MAX_TROCAS_ACEITAS_VARIOS).toBe(200);
  });
});
