import { describe, expect, it } from 'vitest';
import { chaveBusca, compararApelido, formatarData } from '../../src/elenco/apelido.ts';

describe('apelido', () => {
  it('GEL-47: ["Zé", "ana", "Álvaro", "Bia"] ordena em Álvaro, ana, Bia, Zé', () => {
    expect(['Zé', 'ana', 'Álvaro', 'Bia'].sort(compararApelido)).toEqual([
      'Álvaro',
      'ana',
      'Bia',
      'Zé',
    ]);
  });

  it('GEL-47: apelidos iguais sem acento e sem caixa têm ordem estável pelo texto original', () => {
    expect(['josé', 'José', 'Jose'].sort(compararApelido)).toEqual(['Jose', 'José', 'josé']);
  });

  it('GEL-48: chaveBusca("JOSÉ") contém chaveBusca("jose")', () => {
    expect(chaveBusca('JOSÉ')).toContain(chaveBusca('jose'));
  });

  it('GEL-48: busca por trecho do meio, sem acento nem caixa', () => {
    expect(chaveBusca('Conceição')).toContain(chaveBusca('CEIC'));
  });

  it('GEL-48: chaveBusca tira o acento e a caixa', () => {
    expect(chaveBusca('Ângelo Ávila')).toBe('angelo avila');
  });
});

describe('formatarData', () => {
  it('formatarData("2026-10-01") = 01/10/2026', () => {
    expect(formatarData('2026-10-01')).toBe('01/10/2026');
  });

  it('formatarData("2000-01-31") = 31/01/2000', () => {
    expect(formatarData('2000-01-31')).toBe('31/01/2000');
  });
});
