import { describe, expect, it } from 'vitest';
import { classificarDoisTimes, vagasDeReserva, type AptoOrdenado } from '../../src/simulador/classificacao.ts';

/**
 * Titulares, reservas que entram e "não entra" (T6; SIM-21, SIM-22, SIM-23, SIM-89).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Exatamente 2N aptos: sem reservas.
 * - K = 0: ninguém entra; K > N usa min(K, N); K ilimitado usa 2N vagas.
 * - Reservas a menos que as vagas: todos entram, ninguém em "não entra".
 * - Reserva "só 1º" dentro do limite entra marcado como "joga só o 2º"; além do limite, "não entra".
 * - Titular "só 1º" continua titular (a saída no intervalo é a T7).
 * - Menos de 2N aptos: lança (a prévia recusa antes).
 */

function aptos(quantos: number, so1o: readonly number[] = []): AptoOrdenado[] {
  return Array.from({ length: quantos }, (_, i) => ({ id: `p${String(i + 1).padStart(2, '0')}`, so1oTempo: so1o.includes(i + 1) }));
}

const ids = (lista: readonly AptoOrdenado[]): string[] => lista.map((a) => a.id);

describe('vagasDeReserva', () => {
  it('SIM-22: 2 × min(K, N), e 2N com K ilimitado', () => {
    expect(vagasDeReserva(7, 2)).toBe(4);
    expect(vagasDeReserva(7, 9)).toBe(14);
    expect(vagasDeReserva(7, 'ilimitado')).toBe(14);
    expect(vagasDeReserva(7, 0)).toBe(0);
  });
});

describe('classificarDoisTimes', () => {
  it('SIM-21, SIM-22: 19 aptos, N = 7, K = 2: 14 titulares, 4 que entram, 1 "não entra"', () => {
    const c = classificarDoisTimes(aptos(19), 7, 2);
    expect(ids(c.titulares)).toEqual(ids(aptos(14)));
    expect(c.reservasQueEntram.map((r) => r.apto.id)).toEqual(['p15', 'p16', 'p17', 'p18']);
    expect(ids(c.naoEntra)).toEqual(['p19']);
  });

  it('SIM-22: K ilimitado, 40 aptos, N = 7: 14 entram e 12 "não entram"', () => {
    const c = classificarDoisTimes(aptos(40), 7, 'ilimitado');
    expect(c.titulares).toHaveLength(14);
    expect(c.reservasQueEntram).toHaveLength(14);
    expect(c.naoEntra).toHaveLength(12);
  });

  it('SIM-22: K = 9 com N = 7 usa min(K, N) = 7 por time', () => {
    const c = classificarDoisTimes(aptos(40), 7, 9);
    expect(c.reservasQueEntram).toHaveLength(14);
    expect(c.naoEntra).toHaveLength(12);
  });

  it('SIM-22: reservas a menos que as vagas entram todos', () => {
    const c = classificarDoisTimes(aptos(16), 7, 'ilimitado');
    expect(c.reservasQueEntram).toHaveLength(2);
    expect(c.naoEntra).toEqual([]);
  });

  it('SIM-21: exatamente 2N aptos: só titulares', () => {
    const c = classificarDoisTimes(aptos(14), 7, 2);
    expect(c.titulares).toHaveLength(14);
    expect(c.reservasQueEntram).toEqual([]);
    expect(c.naoEntra).toEqual([]);
  });

  it('SIM-89: K = 0: ninguém entra, todos os reservas em "não entra"', () => {
    const c = classificarDoisTimes(aptos(19), 7, 0);
    expect(c.reservasQueEntram).toEqual([]);
    expect(ids(c.naoEntra)).toEqual(['p15', 'p16', 'p17', 'p18', 'p19']);
  });

  it('SIM-23: reserva "só 1º" dentro do limite entra e joga só o 2º tempo', () => {
    const c = classificarDoisTimes(aptos(19, [15]), 7, 2);
    expect(c.reservasQueEntram[0]).toEqual({ apto: { id: 'p15', so1oTempo: true }, jogaSo2oTempo: true });
    expect(c.reservasQueEntram.slice(1).every((r) => !r.jogaSo2oTempo)).toBe(true);
  });

  it('SIM-23: reserva "só 1º" além do limite fica em "não entra"', () => {
    const c = classificarDoisTimes(aptos(19, [19]), 7, 2);
    expect(c.naoEntra).toEqual([{ id: 'p19', so1oTempo: true }]);
    expect(c.reservasQueEntram.map((r) => r.apto.id)).not.toContain('p19');
  });

  it('SIM-21: titular "só 1º" continua titular', () => {
    const c = classificarDoisTimes(aptos(19, [3]), 7, 2);
    expect(ids(c.titulares)).toContain('p03');
  });

  it('SIM-21: menos de 2N aptos lança', () => {
    expect(() => classificarDoisTimes(aptos(13), 7, 2)).toThrow(RangeError);
  });
});
