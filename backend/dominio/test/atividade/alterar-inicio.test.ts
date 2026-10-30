// Critérios: GEL-78 (piso 01/01/2000), GEL-79 (não futura), GEL-80 (não depois da saída do primeiro período), GEL-81
// (recuar move o início do primeiro período, sem mudar os encerrados) e GEL-82 (data igual não altera).
import { describe, expect, it } from 'vitest';
import { avaliarInicio, type EntradaInicio, type PeriodoEntrada } from '../../src/index.ts';

const p = (id: string, inicio: string, fim: string | null): PeriodoEntrada => ({ id, inicio, fim });

/** Entrou em 05/02, saiu em 05/10, voltou em 12/10; hoje 21/10/2026. */
const historico = (): PeriodoEntrada[] => [p('p1', '2026-02-05', '2026-10-05'), p('p2', '2026-10-12', null)];

function avaliar(data: unknown, extra: Partial<EntradaInicio> = {}) {
  return avaliarInicio({ data, periodos: historico(), inicioAtual: '2026-02-05', hoje: '2026-10-21', ...extra });
}

const falha = (regra: string, mensagem: string) => ({ ok: false, regra, campo: 'data', mensagem });

describe('piso de 01/01/2000 (GEL-78)', () => {
  it('31/12/1999 → "A data de início não pode ser anterior a 01/01/2000."', () => {
    expect(avaliar('1999-12-31')).toEqual(
      falha('antes-do-piso', 'A data de início não pode ser anterior a 01/01/2000.'),
    );
  });

  it('01/01/2000 passa', () => {
    expect(avaliar('2000-01-01')).toMatchObject({ ok: true, alterado: true });
  });
});

describe('não futura (GEL-79)', () => {
  it('amanhã → "A data não pode ser no futuro."; hoje passa quando não há saída antes', () => {
    const aberto = [p('p1', '2026-02-05', null)];
    expect(avaliar('2026-10-22', { periodos: aberto })).toEqual(falha('futuro', 'A data não pode ser no futuro.'));
    expect(avaliar('2026-10-21', { periodos: aberto })).toMatchObject({ ok: true });
  });
});

describe('não depois da saída do primeiro período (GEL-80)', () => {
  it('data depois da saída do primeiro → mensagem com a data da saída', () => {
    expect(avaliar('2026-10-06')).toEqual(
      falha(
        'depois-da-saida-do-primeiro',
        'A data de início não pode ficar depois da saída do primeiro período (05/10/2026). Corrija antes a data de saída do primeiro período.',
      ),
    );
  });

  it('no dia da saída, ou antes, passa; avançar dentro do primeiro período não move o período', () => {
    expect(avaliar('2026-10-05')).toMatchObject({ ok: true });
    expect(avaliar('2026-03-01')).toEqual({
      ok: true,
      alterado: true,
      recuarPrimeiroPeriodo: false,
      periodos: historico(),
    });
  });

  it('com o primeiro período aberto, não há saída a respeitar', () => {
    expect(avaliar('2026-10-20', { periodos: [p('p1', '2026-02-05', null)] })).toMatchObject({ ok: true });
  });

  it('o primeiro é o mais antigo, mesmo fora de ordem na entrada', () => {
    const fora = [p('p2', '2026-10-12', null), p('p1', '2026-02-05', '2026-10-05')];
    expect(avaliar('2026-10-06', { periodos: fora })).toMatchObject({ regra: 'depois-da-saida-do-primeiro' });
  });
});

describe('recuar o início (GEL-81)', () => {
  it('data anterior ao início do primeiro período move só o início dele', () => {
    expect(avaliar('2026-02-01')).toEqual({
      ok: true,
      alterado: true,
      recuarPrimeiroPeriodo: true,
      periodos: [p('p1', '2026-02-01', '2026-10-05'), p('p2', '2026-10-12', null)],
    });
  });

  it('com três períodos, os encerrados seguintes não mudam', () => {
    const tres = [
      p('p1', '2026-02-05', '2026-03-01'),
      p('p2', '2026-04-01', '2026-05-01'),
      p('p3', '2026-06-01', null),
    ];
    const r = avaliar('2025-01-10', { periodos: tres, inicioAtual: '2026-02-05' });
    expect(r).toEqual({
      ok: true,
      alterado: true,
      recuarPrimeiroPeriodo: true,
      periodos: [p('p1', '2025-01-10', '2026-03-01'), p('p2', '2026-04-01', '2026-05-01'), p('p3', '2026-06-01', null)],
    });
  });
});

describe('data igual à atual (GEL-82)', () => {
  it('ok sem alteração', () => {
    expect(avaliar('2026-02-05')).toEqual({
      ok: true,
      alterado: false,
      recuarPrimeiroPeriodo: false,
      periodos: historico(),
    });
  });
});

describe('ordem das regras e data inválida', () => {
  it('data que não é AAAA-MM-DD real → "Informe uma data válida."', () => {
    for (const ruim of ['2026-02-30', '2026-13-01', '', null, '05/02/2026']) {
      expect(avaliar(ruim)).toEqual(falha('data-invalida', 'Informe uma data válida.'));
    }
  });

  it('a validade vem antes do piso, o piso antes do futuro e o futuro antes da saída do primeiro', () => {
    expect(avaliar('1999-02-30')).toMatchObject({ regra: 'data-invalida' });
    expect(avaliar('1999-12-31', { hoje: '1999-01-01' })).toMatchObject({ regra: 'antes-do-piso' });
    expect(avaliar('2026-10-22')).toMatchObject({ regra: 'futuro' });
  });

  it('"hoje" inválido é erro de programação', () => {
    expect(() => avaliar('2026-02-01', { hoje: '2026-02-30' })).toThrow(RangeError);
  });
});
