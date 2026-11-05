import { describe, expect, it } from 'vitest';
import type { NomeDiaDaSemana } from '../../src/datas.ts';
import { dataSugeridaPartida } from '../../src/partidas/data-sugerida.ts';

/**
 * Data sugerida da partida (T7; PAR-17).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - hoje é o dia do grupo: hoje;
 * - um dia depois do dia do grupo: o dia anterior; seis dias depois: seis dias antes;
 * - virada de mês e de ano (quinta 31/12/2026, consultada na sexta 01/01/2027);
 * - grupo de domingo (0) e de sábado (6), as pontas da conta do módulo;
 * - hoje inválido lança, em vez de sugerir uma data sem sentido.
 */

describe('dataSugeridaPartida', () => {
  it('PAR-17: grupo de quinta, numa sexta, sugere a quinta anterior; numa quinta, sugere hoje', () => {
    expect(dataSugeridaPartida('2026-10-16', 'quinta')).toBe('2026-10-15');
    expect(dataSugeridaPartida('2026-10-15', 'quinta')).toBe('2026-10-15');
  });

  it('PAR-17: virada de mês e de ano (quinta 2026-12-31 → sexta 2027-01-01)', () => {
    expect(dataSugeridaPartida('2027-01-01', 'quinta')).toBe('2026-12-31');
  });

  it('PAR-17: na quarta, o grupo de quinta volta seis dias', () => {
    expect(dataSugeridaPartida('2026-10-21', 'quinta')).toBe('2026-10-15');
  });

  it.each<[NomeDiaDaSemana, string]>([
    ['domingo', '2026-10-11'],
    ['segunda', '2026-10-12'],
    ['terca', '2026-10-13'],
    ['quarta', '2026-10-14'],
    ['quinta', '2026-10-15'],
    ['sexta', '2026-10-16'],
    ['sabado', '2026-10-17'],
  ])('PAR-17: no sábado 17/10/2026, o grupo de %s sugere %s', (dia, esperado) => {
    expect(dataSugeridaPartida('2026-10-17', dia)).toBe(esperado);
  });

  it('PAR-17: hoje inválido lança', () => {
    expect(() => dataSugeridaPartida('2026-02-30', 'quinta')).toThrow(RangeError);
  });
});
