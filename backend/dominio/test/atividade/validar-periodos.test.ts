// Critérios: GEL-63 (data real), GEL-64 (não futura), GEL-65 (saída antes do início), GEL-66 (as três regras de
// ordem), GEL-67 (sobreposição) e a ordem do GEL-62 entre elas (só a primeira falha volta).
import { describe, expect, it } from 'vitest';
import { validarPeriodos, type PedidoValidacao, type PeriodoEntrada } from '../../src/index.ts';

const p = (id: string, inicio: string, fim: string | null): PeriodoEntrada => ({ id, inicio, fim });

/** p1 [01/01, 01/03), p2 [01/04, 01/06), p3 [01/07, ∞); hoje 21/10/2026. */
const tres = (): PeriodoEntrada[] => [
  p('p1', '2026-01-01', '2026-03-01'),
  p('p2', '2026-04-01', '2026-06-01'),
  p('p3', '2026-07-01', null),
];

function validar(pedido: Partial<PedidoValidacao>) {
  return validarPeriodos({ periodos: tres(), periodoId: 'p2', hoje: '2026-10-21', ...pedido });
}

const falha = (regra: string, campo: string, mensagem: string) => ({ ok: false, regra, campo, mensagem });

describe('data válida (GEL-63)', () => {
  it.each(['2026-02-30', '2026-13-01', '2026-02-29', '2026-00-10', '2026-1-2', ' 2026-01-02', '2026-01-02T00:00', ''])(
    '%j → "Informe uma data válida."',
    (ruim) => {
      expect(validar({ saida: ruim })).toEqual(falha('data-invalida', 'saida', 'Informe uma data válida.'));
      expect(validar({ retorno: ruim })).toEqual(falha('data-invalida', 'retorno', 'Informe uma data válida.'));
    },
  );

  it('não texto também é data inválida', () => {
    expect(validar({ saida: null })).toEqual(falha('data-invalida', 'saida', 'Informe uma data válida.'));
    expect(validar({ retorno: 20261001 })).toEqual(falha('data-invalida', 'retorno', 'Informe uma data válida.'));
  });

  it('29/02 de ano bissexto é data válida', () => {
    const periodos = [p('p1', '2028-01-01', '2028-03-01'), p('p2', '2028-04-01', null)];
    expect(validarPeriodos({ periodos, periodoId: 'p1', saida: '2028-02-29', hoje: '2028-10-01' })).toMatchObject({
      ok: true,
    });
  });
});

describe('data não futura (GEL-64)', () => {
  it('amanhã → "A data não pode ser no futuro."; hoje é aceito', () => {
    const periodos = [p('p1', '2026-01-01', null)];
    expect(validarPeriodos({ periodos, periodoId: 'p1', saida: '2026-10-22', hoje: '2026-10-21' })).toEqual(
      falha('futuro', 'saida', 'A data não pode ser no futuro.'),
    );
    expect(validarPeriodos({ periodos, periodoId: 'p1', saida: '2026-10-21', hoje: '2026-10-21' })).toMatchObject({
      ok: true,
    });
  });

  it('vale para o retorno de um período novo (reativar)', () => {
    const periodos = [p('p1', '2026-01-01', '2026-03-01')];
    expect(validarPeriodos({ periodos, periodoId: null, retorno: '2027-01-01', hoje: '2026-10-21' })).toEqual(
      falha('futuro', 'retorno', 'A data não pode ser no futuro.'),
    );
  });
});

describe('regras de ordem (GEL-65, GEL-66)', () => {
  it('saída antes do início do próprio período; igual ao início é aceita (GEL-65)', () => {
    expect(validar({ saida: '2026-03-31' })).toEqual(
      falha('saida-antes-do-inicio', 'saida', 'A saída não pode ser antes do início deste período (01/04/2026).'),
    );
    expect(validar({ saida: '2026-04-01' })).toMatchObject({ ok: true });
  });

  it('retorno antes da saída anterior; igual a ela é aceito (GEL-66)', () => {
    expect(validar({ retorno: '2026-02-28' })).toEqual(
      falha(
        'retorno-antes-da-saida-anterior',
        'retorno',
        'O retorno não pode ser antes da saída anterior (01/03/2026).',
      ),
    );
    expect(validar({ retorno: '2026-03-01' })).toMatchObject({ ok: true });
  });

  it('saída depois do próximo retorno; igual a ele é aceita (GEL-66)', () => {
    expect(validar({ saida: '2026-07-02' })).toEqual(
      falha('saida-depois-do-proximo-retorno', 'saida', 'A saída não pode ser depois do próximo retorno (01/07/2026).'),
    );
    expect(validar({ saida: '2026-07-01' })).toMatchObject({ ok: true });
  });

  it('retorno depois da saída do próprio período; igual a ela é aceito (GEL-66)', () => {
    expect(validar({ retorno: '2026-06-02' })).toEqual(
      falha('retorno-depois-da-saida', 'retorno', 'O retorno não pode ser depois da saída deste período (01/06/2026).'),
    );
    expect(validar({ retorno: '2026-06-01' })).toMatchObject({ ok: true });
  });

  it('com saída e retorno juntos, o retorno novo é o início que a saída respeita', () => {
    expect(validar({ retorno: '2026-05-01', saida: '2026-04-15' })).toEqual(
      falha('saida-antes-do-inicio', 'saida', 'A saída não pode ser antes do início deste período (01/05/2026).'),
    );
    expect(validar({ retorno: '2026-03-15', saida: '2026-06-20' })).toEqual({
      ok: true,
      periodos: [p('p1', '2026-01-01', '2026-03-01'), p('p2', '2026-03-15', '2026-06-20'), p('p3', '2026-07-01', null)],
    });
  });

  it('reativar: retorno antes da última saída é recusado; no mesmo dia é aceito', () => {
    const periodos = [p('p1', '2026-01-01', '2026-10-05')];
    expect(validarPeriodos({ periodos, periodoId: null, retorno: '2026-10-04', hoje: '2026-10-21' })).toEqual(
      falha(
        'retorno-antes-da-saida-anterior',
        'retorno',
        'O retorno não pode ser antes da saída anterior (05/10/2026).',
      ),
    );
    expect(validarPeriodos({ periodos, periodoId: null, retorno: '2026-10-05', hoje: '2026-10-21' })).toEqual({
      ok: true,
      periodos: [p('p1', '2026-01-01', '2026-10-05'), { inicio: '2026-10-05', fim: null }],
    });
  });
});

describe('sobreposição (GEL-67)', () => {
  it('abrir um período novo com outro ainda aberto sobrepõe', () => {
    const periodos = [p('p1', '2026-01-01', null)];
    expect(validarPeriodos({ periodos, periodoId: null, retorno: '2026-10-21', hoje: '2026-10-21' })).toEqual(
      falha('sobreposicao', 'retorno', 'Os períodos não podem se sobrepor.'),
    );
  });

  it('períodos já sobrepostos no dado gravado são recusados ao editar', () => {
    const periodos = [p('p1', '2026-01-01', '2026-05-01'), p('p2', '2026-04-01', null)];
    expect(validarPeriodos({ periodos, periodoId: 'p2', retorno: '2026-05-10', hoje: '2026-10-21' })).toMatchObject({
      ok: true,
    });
    const tresSobrepostos = [
      p('p1', '2026-01-01', '2026-05-01'),
      p('p2', '2026-04-01', '2026-04-20'),
      p('p3', '2026-08-01', null),
    ];
    expect(
      validarPeriodos({ periodos: tresSobrepostos, periodoId: 'p3', retorno: '2026-08-02', hoje: '2026-10-21' }),
    ).toEqual(falha('sobreposicao', 'retorno', 'Os períodos não podem se sobrepor.'));
  });

  it('sair e voltar no mesmo dia não é sobreposição (GEL-61)', () => {
    const periodos = [p('p1', '2026-01-01', '2026-05-05'), p('p2', '2026-05-05', null)];
    expect(validarPeriodos({ periodos, periodoId: 'p1', saida: '2026-05-05', hoje: '2026-10-21' })).toMatchObject({
      ok: true,
    });
  });
});

describe('ordem do GEL-62: só a primeira falha volta', () => {
  it('data inválida vence data futura, mesmo em campo posterior', () => {
    expect(validar({ saida: '2027-01-01', retorno: '2026-02-30' })).toMatchObject({ regra: 'data-invalida' });
  });

  it('futura vence as regras de ordem', () => {
    // retorno futuro e também depois da saída do período: vence "futuro".
    expect(validar({ retorno: '2027-01-01' })).toMatchObject({ regra: 'futuro' });
  });

  it('saída antes do início vence retorno antes da saída anterior', () => {
    expect(validar({ retorno: '2026-02-15', saida: '2026-02-10' })).toMatchObject({ regra: 'saida-antes-do-inicio' });
  });

  it('retorno antes da saída anterior vence saída depois do próximo retorno', () => {
    expect(validar({ retorno: '2026-02-15', saida: '2026-07-05' })).toMatchObject({
      regra: 'retorno-antes-da-saida-anterior',
    });
  });

  it('com saída e retorno juntos, retorno depois da saída cai antes como saída antes do início', () => {
    expect(validar({ saida: '2026-05-05', retorno: '2026-05-06' })).toMatchObject({ regra: 'saida-antes-do-inicio' });
  });

  it('as regras de ordem vencem a sobreposição', () => {
    const tresSobrepostos = [
      p('p1', '2026-01-01', '2026-05-01'),
      p('p2', '2026-04-01', '2026-04-20'),
      p('p3', '2026-08-01', null),
    ];
    expect(
      validarPeriodos({ periodos: tresSobrepostos, periodoId: 'p3', retorno: '2026-03-01', hoje: '2026-10-21' }),
    ).toMatchObject({ regra: 'retorno-antes-da-saida-anterior' });
    expect(
      validarPeriodos({ periodos: tresSobrepostos, periodoId: 'p1', saida: '2026-06-01', hoje: '2026-10-21' }),
    ).toMatchObject({ regra: 'saida-depois-do-proximo-retorno' });
  });
});

describe('entrada', () => {
  it('não altera os períodos recebidos e aceita qualquer ordem', () => {
    const periodos = Object.freeze([
      Object.freeze(p('p3', '2026-07-01', null)),
      Object.freeze(p('p1', '2026-01-01', '2026-03-01')),
      Object.freeze(p('p2', '2026-04-01', '2026-06-01')),
    ]);
    const copia = JSON.stringify(periodos);
    expect(validarPeriodos({ periodos, periodoId: 'p2', saida: '2026-06-10', hoje: '2026-10-21' })).toMatchObject({
      ok: true,
    });
    expect(JSON.stringify(periodos)).toBe(copia);
  });

  it('período inexistente e "hoje" inválido são erro de programação, não regra', () => {
    expect(() => validar({ periodoId: 'zzz', saida: '2026-05-01' })).toThrow(RangeError);
    expect(() => validar({ saida: '2026-05-01', hoje: '2026-02-30' })).toThrow(RangeError);
  });
});
