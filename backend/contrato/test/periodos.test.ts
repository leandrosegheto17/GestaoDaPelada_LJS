import { describe, expect, it } from 'vitest';
import { MENSAGEM_TEXTO_INVISIVEL } from '../src/grupo.ts';
import {
  corrigirPeriodoCorpo,
  dataCorpo,
  habilidadeCorpo,
  inicioCorpo,
  MENSAGEM_NOME_HABILIDADE,
  MENSAGEM_NOTA,
  notaCorpo,
} from '../src/periodos.ts';

/** Contrato de períodos, habilidades e notas (T18; GEL-52, GEL-55, GEL-90, GEL-99, SEC-005). */

function mensagens(resultado: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  const porCampo: Record<string, string[]> = {};
  for (const problema of resultado.error?.issues ?? []) {
    const campo = String(problema.path[0] ?? '');
    (porCampo[campo] ??= []).push(problema.message);
  }
  return porCampo;
}

describe('dataCorpo', () => {
  it('GEL-52, GEL-55: corpo vazio é aceito (a rota usa hoje)', () => {
    expect(dataCorpo.parse({})).toEqual({});
  });

  it('GEL-52, GEL-55: data informada passa como veio', () => {
    expect(dataCorpo.parse({ data: '2026-11-05' })).toEqual({ data: '2026-11-05' });
  });

  it('GEL-63: data fora do formato dá "Informe uma data válida."', () => {
    expect(mensagens(dataCorpo.safeParse({ data: '05/11/2026' }))).toEqual({
      data: ['Informe uma data válida.'],
    });
    expect(mensagens(dataCorpo.safeParse({ data: 20261105 }))).toEqual({
      data: ['Informe uma data válida.'],
    });
  });

  it('dataCorpo recusa campo a mais', () => {
    expect(dataCorpo.safeParse({ data: '2026-11-05', jogadorId: 'x' }).success).toBe(false);
  });
});

describe('corrigirPeriodoCorpo e inicioCorpo', () => {
  it('GEL-71: aceita só a saída, só o retorno ou os dois', () => {
    expect(corrigirPeriodoCorpo.safeParse({ saida: '2026-01-10' }).success).toBe(true);
    expect(corrigirPeriodoCorpo.safeParse({ retorno: '2026-01-10' }).success).toBe(true);
    expect(
      corrigirPeriodoCorpo.safeParse({ saida: '2026-01-10', retorno: '2026-02-01' }).success,
    ).toBe(true);
  });

  it('GEL-71: sem saída nem retorno é recusado', () => {
    expect(corrigirPeriodoCorpo.safeParse({}).success).toBe(false);
  });

  it('GEL-71: campo a mais é recusado', () => {
    expect(
      corrigirPeriodoCorpo.safeParse({ saida: '2026-01-10', inicio: '2026-01-01' }).success,
    ).toBe(false);
  });

  it('GEL-77: o início exige a data', () => {
    expect(inicioCorpo.safeParse({}).success).toBe(false);
    expect(inicioCorpo.parse({ data: '2001-01-01' })).toEqual({ data: '2001-01-01' });
  });
});

describe('habilidadeCorpo', () => {
  it.each([' A ', 'a'.repeat(31)])('GEL-90: %j é recusado com a mensagem', (nome) => {
    expect(mensagens(habilidadeCorpo.safeParse({ nome }))).toEqual({
      nome: [MENSAGEM_NOME_HABILIDADE],
    });
    expect(MENSAGEM_NOME_HABILIDADE).toBe('O nome precisa ter de 2 a 30 caracteres.');
  });

  it('GEL-90: 2 e 30 caracteres são aceitos, sem os espaços das pontas', () => {
    expect(habilidadeCorpo.parse({ nome: '  Ab  ' }).nome).toBe('Ab');
    expect(habilidadeCorpo.parse({ nome: 'a'.repeat(30) }).nome).toBe('a'.repeat(30));
  });

  it('SEC-005: NUL no nome da habilidade é recusado', () => {
    expect(mensagens(habilidadeCorpo.safeParse({ nome: 'Dri\u0000ble' }))).toEqual({
      nome: [MENSAGEM_TEXTO_INVISIVEL],
    });
  });

  it('SEC-005: nome só de invisíveis é recusado', () => {
    expect(habilidadeCorpo.safeParse({ nome: '​​' }).success).toBe(false);
  });
});

describe('notaCorpo', () => {
  it.each([0, 11, 5.5, '7', undefined])('GEL-99: nota %j é recusada no campo nota', (nota) => {
    expect(mensagens(notaCorpo.safeParse({ nota }))).toEqual({ nota: [MENSAGEM_NOTA] });
  });

  it.each([1, 7, 10])('GEL-97: nota %s é aceita', (nota) => {
    expect(notaCorpo.parse({ nota })).toEqual({ nota });
  });

  it('GEL-98: null é aceito (apaga a nota)', () => {
    expect(notaCorpo.parse({ nota: null })).toEqual({ nota: null });
  });

  it('GEL-99: campo a mais é recusado', () => {
    expect(notaCorpo.safeParse({ nota: 7, habilidadeId: 'h1' }).success).toBe(false);
  });
});
