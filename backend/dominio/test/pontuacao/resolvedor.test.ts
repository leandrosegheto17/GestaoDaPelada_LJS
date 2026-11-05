import { describe, expect, it } from 'vitest';
import { PESOS_PADRAO, pontosDaPresenca, type ConfigPesos } from '../../src/pontuacao/pesos.ts';
import { criarResolvedorDePesos, MENSAGEM_SEM_PESOS } from '../../src/pontuacao/resolvedor.ts';

/**
 * Resolvedor de pesos por vigência (T3; PAR-56).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - partida no dia exato do `vigente_desde` usa a nova (`B:491`);
 * - partida na véspera do `vigente_desde` usa a anterior;
 * - pesos trocados no meio do mês: cada partida pela sua vigência (`B:490`);
 * - data anterior à primeira configuração usa a mais antiga;
 * - configurações fora de ordem na entrada; uma só configuração; lista vazia lança.
 */

const config = (vigenteDesde: string, presencaSemChuva: number): ConfigPesos => ({
  ...PESOS_PADRAO,
  presencaSemChuva,
  vigenteDesde,
});

const JAN = config('2026-01-01', 1);
const MEIO_OUT = config('2026-10-10', 3);
const DEZ = config('2026-12-01', 5);

describe('criarResolvedorDePesos', () => {
  const resolver = criarResolvedorDePesos([DEZ, JAN, MEIO_OUT]);

  it('PAR-56: partida no dia exato do vigente_desde usa a configuração nova', () => {
    expect(resolver('2026-10-10')).toBe(MEIO_OUT);
  });

  it('PAR-56: na véspera do vigente_desde vale a anterior', () => {
    expect(resolver('2026-10-09')).toBe(JAN);
  });

  it('PAR-56: pesos trocados no meio do mês pontuam cada partida pela sua vigência', () => {
    const pontos = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((data) =>
      pontosDaPresenca('presente', false, resolver(data)),
    );
    expect(pontos).toEqual([1, 1, 3, 3]);
  });

  it('PAR-56: data anterior à primeira configuração usa a mais antiga', () => {
    expect(resolver('2025-06-01')).toBe(JAN);
  });

  it('PAR-56: data depois da última usa a última', () => {
    expect(resolver('2027-03-01')).toBe(DEZ);
  });

  it('PAR-56: uma só configuração vale para qualquer data', () => {
    const unico = criarResolvedorDePesos([MEIO_OUT]);
    expect(unico('2020-01-01')).toBe(MEIO_OUT);
    expect(unico('2030-01-01')).toBe(MEIO_OUT);
  });

  it('PAR-56: lista vazia lança', () => {
    expect(() => criarResolvedorDePesos([])).toThrow(MENSAGEM_SEM_PESOS);
  });
});
