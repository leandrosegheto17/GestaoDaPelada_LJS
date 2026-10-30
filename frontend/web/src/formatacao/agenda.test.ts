// Critério: GEL-27 (t08): a recorrência do grupo aparece sob o nome, como no mockup.
import { describe, expect, it } from 'vitest';
import { descreverAgenda } from './agenda';

describe('descreverAgenda', () => {
  it.each([
    [{ diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' }, 'Toda quinta · 20:00'],
    [{ diaSemana: 'domingo', frequencia: 'semanal', horario: '09:00' }, 'Todo domingo · 09:00'],
    [{ diaSemana: 'sabado', frequencia: 'semanal', horario: '08:30' }, 'Todo sábado · 08:30'],
    [{ diaSemana: 'domingo', frequencia: 'quinzenal', horario: '09:00' }, 'Domingo, quinzenal · 09:00'],
    [{ diaSemana: 'terca', frequencia: 'mensal', horario: '19:00' }, 'Terça, mensal · 19:00'],
  ] as const)('%o → %s', (grupo, texto) => {
    expect(descreverAgenda(grupo)).toBe(texto);
  });
});
