import { describe, expect, it } from 'vitest';
import {
  configFinanceiraCorpo,
  configFinanceiraResposta,
  LIMITES_FINANCEIRO,
  MENSAGEM_MES_INVALIDO,
  mesFinanceiroConsulta,
  mesFinanceiroResposta,
} from '../src/financeiro.ts';

/** Contrato da configuração e do mês do caixa (T7; FIN-01, FIN-03, FIN-07, FIN-13). */

function campos(resultado: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}): string[] {
  return [...new Set((resultado.error?.issues ?? []).map((p) => String(p.path[0] ?? '')))];
}

const corpoValido = {
  mensalidadeCentavos: 7_500,
  saldoInicialCentavos: 35_000,
  dataSaldoInicial: '2026-10-01',
};

describe('configFinanceiraCorpo', () => {
  it('FIN-01: corpo válido passa como veio', () => {
    expect(configFinanceiraCorpo.parse(corpoValido)).toEqual(corpoValido);
  });

  it('FIN-01: mensalidade nula aceita', () => {
    expect(
      configFinanceiraCorpo.parse({ ...corpoValido, mensalidadeCentavos: null })
        .mensalidadeCentavos,
    ).toBeNull();
  });

  it('FIN-01: limites exatos aceitos', () => {
    expect(
      configFinanceiraCorpo.safeParse({ ...corpoValido, mensalidadeCentavos: 1 }).success,
    ).toBe(true);
    expect(
      configFinanceiraCorpo.safeParse({ ...corpoValido, mensalidadeCentavos: 99_999_999 }).success,
    ).toBe(true);
    expect(
      configFinanceiraCorpo.safeParse({ ...corpoValido, saldoInicialCentavos: -99_999_999 })
        .success,
    ).toBe(true);
    expect(
      configFinanceiraCorpo.safeParse({ ...corpoValido, saldoInicialCentavos: 99_999_999 }).success,
    ).toBe(true);
    expect(
      configFinanceiraCorpo.safeParse({ ...corpoValido, saldoInicialCentavos: 0 }).success,
    ).toBe(true);
  });

  it.each([1.5, '75', 0, 100_000_000, -1, Number.NaN, true])(
    'FIN-03: mensalidade %s recusada no campo mensalidadeCentavos',
    (valor) => {
      expect(
        campos(configFinanceiraCorpo.safeParse({ ...corpoValido, mensalidadeCentavos: valor })),
      ).toEqual(['mensalidadeCentavos']);
    },
  );

  it.each([1.5, '350', 100_000_000, -100_000_000, null])(
    'FIN-03: saldo inicial %s recusado no campo saldoInicialCentavos',
    (valor) => {
      expect(
        campos(configFinanceiraCorpo.safeParse({ ...corpoValido, saldoInicialCentavos: valor })),
      ).toEqual(['saldoInicialCentavos']);
    },
  );

  it('FIN-03: mensalidade ausente é recusada (nulo precisa vir explícito)', () => {
    const { mensalidadeCentavos: _fora, ...semMensalidade } = corpoValido;
    expect(campos(configFinanceiraCorpo.safeParse(semMensalidade))).toEqual([
      'mensalidadeCentavos',
    ]);
  });

  it.each(['2026-02-30', '01/10/2026', '2026-13-01', '', 20261001])(
    'FIN-03: data do saldo inicial %s recusada no campo dataSaldoInicial',
    (valor) => {
      expect(
        campos(configFinanceiraCorpo.safeParse({ ...corpoValido, dataSaldoInicial: valor })),
      ).toEqual(['dataSaldoInicial']);
    },
  );

  it('FIN-03: 29/02 de ano bissexto aceito', () => {
    expect(
      configFinanceiraCorpo.safeParse({ ...corpoValido, dataSaldoInicial: '2028-02-29' }).success,
    ).toBe(true);
  });

  it('FIN-03: campo extra recusado', () => {
    expect(configFinanceiraCorpo.safeParse({ ...corpoValido, grupoId: 'x' }).success).toBe(false);
  });

  it('FIN-03: vários campos inválidos saem todos', () => {
    const resultado = configFinanceiraCorpo.safeParse({
      mensalidadeCentavos: '75',
      saldoInicialCentavos: 1.5,
      dataSaldoInicial: 'ontem',
    });
    expect(campos(resultado).sort()).toEqual([
      'dataSaldoInicial',
      'mensalidadeCentavos',
      'saldoInicialCentavos',
    ]);
  });

  it('os limites seguem a spec', () => {
    expect(LIMITES_FINANCEIRO).toEqual({
      valorMin: 1,
      valorMax: 99_999_999,
      saldoInicialMin: -99_999_999,
      saldoInicialMax: 99_999_999,
    });
  });
});

describe('mesFinanceiroConsulta', () => {
  it('FIN-07: sem mes é aceito (a rota usa o mês de hoje)', () => {
    expect(mesFinanceiroConsulta.parse({})).toEqual({});
  });

  it('FIN-07: mes AAAA-MM passa', () => {
    expect(mesFinanceiroConsulta.parse({ mes: '2026-10' })).toEqual({ mes: '2026-10' });
  });

  it.each(['2026-13', '2026-00', '2026-1', '10/2026', '2026-10-01', ''])(
    'FIN-07: mes %s dá "Mês inválido."',
    (mes) => {
      const resultado = mesFinanceiroConsulta.safeParse({ mes });
      expect(resultado.success).toBe(false);
      expect(resultado.error?.issues[0]?.message).toBe(MENSAGEM_MES_INVALIDO);
      expect(resultado.error?.issues[0]?.path).toEqual(['mes']);
    },
  );

  it('mesFinanceiroConsulta recusa parâmetro a mais', () => {
    expect(mesFinanceiroConsulta.safeParse({ mes: '2026-10', grupo: 'x' }).success).toBe(false);
  });
});

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

const respostaValida = {
  mes: '2026-10',
  hoje: '2026-10-15',
  navegacao: { mesAnterior: '2026-09', mesSeguinte: null },
  config: corpoValido,
  saldoAtualCentavos: 10_000_000_000,
  resumoMes: {
    entradasCentavos: 10_000_000_000,
    saidasCentavos: 0,
    resultadoCentavos: 10_000_000_000,
    naoPagaram: 4,
  },
  pagamentos: [{ jogadorId: ID_A, apelido: 'Toninho', pagou: true }],
  lancamentos: [
    {
      id: ID_B,
      tipo: 'entrada',
      data: '2026-10-05',
      descricao: 'Mensalidade Toninho 10/2026',
      valorCentavos: 7_500,
      mensalidade: true,
    },
  ],
};

describe('mesFinanceiroResposta', () => {
  it('FIN-07: resposta completa passa', () => {
    expect(mesFinanceiroResposta.safeParse(respostaValida).success).toBe(true);
  });

  it('FIN-13: a resposta aceita saldo de 10.000.000.000 (acima do teto de entrada)', () => {
    expect(mesFinanceiroResposta.parse(respostaValida).saldoAtualCentavos).toBe(10_000_000_000);
  });

  it('FIN-13: saldo e resultado negativos passam; saldo fora do inteiro seguro não', () => {
    const negativo = {
      ...respostaValida,
      saldoAtualCentavos: -10_000_000_000,
      resumoMes: { ...respostaValida.resumoMes, resultadoCentavos: -5 },
    };
    expect(mesFinanceiroResposta.safeParse(negativo).success).toBe(true);
    expect(
      mesFinanceiroResposta.safeParse({
        ...respostaValida,
        saldoAtualCentavos: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
    expect(
      mesFinanceiroResposta.safeParse({ ...respostaValida, saldoAtualCentavos: 1.5 }).success,
    ).toBe(false);
  });

  it('FIN-08: sem configuração, configuração, saldo e resumo nulos com listas vazias e navegação nula', () => {
    const vazia = {
      mes: '2026-10',
      hoje: '2026-10-15',
      navegacao: { mesAnterior: null, mesSeguinte: null },
      config: null,
      saldoAtualCentavos: null,
      resumoMes: null,
      pagamentos: [],
      lancamentos: [],
    };
    expect(mesFinanceiroResposta.safeParse(vazia).success).toBe(true);
  });

  it('FIN-08: configuração nula com saldo presente é recusada', () => {
    expect(mesFinanceiroResposta.safeParse({ ...respostaValida, config: null }).success).toBe(
      false,
    );
  });

  it('FIN-14: lançamento sem a marca mensalidade é recusado', () => {
    const { mensalidade: _fora, ...semMarca } = respostaValida.lancamentos[0]!;
    expect(
      mesFinanceiroResposta.safeParse({ ...respostaValida, lancamentos: [semMarca] }).success,
    ).toBe(false);
  });

  it('a resposta recusa campo a mais', () => {
    expect(mesFinanceiroResposta.safeParse({ ...respostaValida, extra: 1 }).success).toBe(false);
  });
});

describe('configFinanceiraResposta', () => {
  it('FIN-01: devolve os três campos', () => {
    expect(configFinanceiraResposta.parse(corpoValido)).toEqual(corpoValido);
    expect(
      configFinanceiraResposta.safeParse({ ...corpoValido, mensalidadeCentavos: null }).success,
    ).toBe(true);
  });
});
