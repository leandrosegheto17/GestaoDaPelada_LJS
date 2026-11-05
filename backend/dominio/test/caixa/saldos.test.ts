import { describe, expect, it } from 'vitest';
import { ErroEstouroCentavos } from '../../src/caixa/centavos.ts';
import { saldoAtual, totais, type ConfigCaixa, type MovimentoCaixa } from '../../src/caixa/saldos.ts';

/** Saldo atual do caixa (T3; FIN-10, FIN-13, FIN-49). "Hoje" chega como parâmetro, já no fuso de São Paulo. */

const config: ConfigCaixa = { mensalidadeCentavos: 7_500, saldoInicialCentavos: 35_000, dataSaldoInicial: '2026-10-01' };

const entrada = (data: string, valorCentavos: number): MovimentoCaixa => ({ tipo: 'entrada', data, valorCentavos });
const saida = (data: string, valorCentavos: number): MovimentoCaixa => ({ tipo: 'saida', data, valorCentavos });

describe('saldoAtual', () => {
  it('FIN-10: sem lançamentos, o saldo é o saldo inicial', () => {
    expect(saldoAtual(config, [], '2026-10-15')).toBe(35_000);
  });

  it('FIN-10: saldo inicial + entradas − saídas do intervalo', () => {
    const lancamentos = [entrada('2026-10-02', 7_500), entrada('2026-10-03', 7_500), saida('2026-10-10', 80_000)];
    expect(saldoAtual(config, lancamentos, '2026-10-15')).toBe(35_000 + 15_000 - 80_000);
  });

  it('FIN-10: lançamento anterior à data inicial e lançamento de amanhã não contam; o de hoje conta', () => {
    const lancamentos = [
      entrada('2026-09-30', 1_000_000),
      saida('2026-10-16', 500_000),
      entrada('2026-10-15', 7_500),
    ];
    expect(saldoAtual(config, lancamentos, '2026-10-15')).toBe(42_500);
  });

  it('FIN-10: o lançamento do dia do saldo inicial conta (intervalo inclusivo nas duas pontas)', () => {
    expect(saldoAtual(config, [saida('2026-10-01', 5_000)], '2026-10-01')).toBe(30_000);
  });

  it('FIN-10: saldo inicial negativo sai negativo', () => {
    const negativo: ConfigCaixa = { ...config, saldoInicialCentavos: -99_999_999 };
    expect(saldoAtual(negativo, [saida('2026-10-05', 1_000)], '2026-10-15')).toBe(-100_000_999);
  });

  it('FIN-10: hoje antes da data inicial devolve o saldo inicial', () => {
    const futuro: ConfigCaixa = { ...config, dataSaldoInicial: '2026-11-01' };
    expect(saldoAtual(futuro, [entrada('2026-11-01', 7_500), entrada('2026-10-30', 7_500)], '2026-10-31')).toBe(
      35_000,
    );
  });

  it('FIN-49: a virada de mês não muda o corte, que é sempre a data de hoje recebida', () => {
    const lancamentos = [entrada('2026-10-31', 7_500), entrada('2026-11-01', 7_500)];
    expect(saldoAtual(config, lancamentos, '2026-10-31')).toBe(42_500);
    expect(saldoAtual(config, lancamentos, '2026-11-01')).toBe(50_000);
  });

  it('FIN-13: soma acima do teto do cliente continua exata', () => {
    const lancamentos = Array.from({ length: 200 }, () => entrada('2026-10-02', 99_999_999));
    expect(saldoAtual(config, lancamentos, '2026-10-15')).toBe(35_000 + 19_999_999_800);
  });

  it('FIN-13: estouro do inteiro seguro lança em vez de devolver valor truncado', () => {
    const lancamentos = [entrada('2026-10-02', Number.MAX_SAFE_INTEGER)];
    expect(() => saldoAtual(config, lancamentos, '2026-10-15')).toThrow(ErroEstouroCentavos);
  });
});

describe('totais', () => {
  it('FIN-13: separa entradas e saídas, ambas positivas', () => {
    expect(totais([entrada('2026-10-02', 7_500), saida('2026-10-03', 900), entrada('2026-10-04', 100)])).toEqual({
      entradasCentavos: 7_600,
      saidasCentavos: 900,
    });
  });
});
