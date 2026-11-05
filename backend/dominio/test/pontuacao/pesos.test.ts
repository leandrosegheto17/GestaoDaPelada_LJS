import { describe, expect, it } from 'vitest';
import {
  ehPesosPadrao,
  PESOS_PADRAO,
  pontosDaPresenca,
  type ConfigPesos,
  type Pesos,
  type SituacaoGravada,
} from '../../src/pontuacao/pesos.ts';

/**
 * Pesos (T2; PAR-55, PAR-135, PAR-13).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - expulso com chuva usa `expulsoComChuva`, nunca o `expulso` sem chuva (`B:496`);
 * - as 3 situações × chuva sim/não, com pesos todos distintos, para que trocar um campo por outro apareça;
 * - "Pesos padrão": exatamente uma configuração com os 6 valores de RN-18; duas padrão = falso; uma diferente = falso;
 *   lista vazia = falso.
 */

const DISTINTOS: Pesos = {
  presencaSemChuva: 3,
  presencaComChuva: 4,
  lesionadoSemChuva: 1,
  lesionadoComChuva: 2,
  expulsoSemChuva: -2,
  expulsoComChuva: -5,
};

const padrao = (vigenteDesde: string): ConfigPesos => ({ ...PESOS_PADRAO, vigenteDesde });

describe('pontosDaPresenca', () => {
  it('PAR-55: expulso em partida com chuva usa expulsoComChuva', () => {
    expect(pontosDaPresenca('expulso', true, DISTINTOS)).toBe(-5);
  });

  it.each<[SituacaoGravada, boolean, number]>([
    ['presente', false, 3],
    ['presente', true, 4],
    ['lesionado', false, 1],
    ['lesionado', true, 2],
    ['expulso', false, -2],
    ['expulso', true, -5],
  ])('PAR-55: %s com chuva=%s vale %i', (situacao, choveu, esperado) => {
    expect(pontosDaPresenca(situacao, choveu, DISTINTOS)).toBe(esperado);
  });
});

describe('PESOS_PADRAO', () => {
  it('PAR-13: 1, 1, 1, 1, −1, −1', () => {
    expect(PESOS_PADRAO).toEqual({
      presencaSemChuva: 1,
      presencaComChuva: 1,
      lesionadoSemChuva: 1,
      lesionadoComChuva: 1,
      expulsoSemChuva: -1,
      expulsoComChuva: -1,
    });
    expect(Object.isFrozen(PESOS_PADRAO)).toBe(true);
  });
});

describe('ehPesosPadrao', () => {
  it('PAR-135: uma só configuração padrão é "Pesos padrão"', () => {
    expect(ehPesosPadrao([padrao('2026-01-01')])).toBe(true);
  });

  it('PAR-135: falso com duas configurações, mesmo ambas padrão', () => {
    expect(ehPesosPadrao([padrao('2026-01-01'), padrao('2026-03-01')])).toBe(false);
  });

  it('PAR-135: falso com uma não padrão', () => {
    expect(ehPesosPadrao([{ ...PESOS_PADRAO, expulsoComChuva: -2, vigenteDesde: '2026-01-01' }])).toBe(false);
  });

  it('PAR-135: falso sem configuração', () => {
    expect(ehPesosPadrao([])).toBe(false);
  });
});
