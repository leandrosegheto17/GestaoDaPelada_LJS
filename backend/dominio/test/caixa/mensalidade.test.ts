import { describe, expect, it } from 'vitest';
import { entradaDaMensalidade } from '../../src/caixa/mensalidade.ts';
import type { ConfigCaixa } from '../../src/caixa/saldos.ts';

/** Entrada criada ao marcar a mensalidade (T6; FIN-16, FIN-17). Regime de caixa: a data é a do dia em que se marca. */

const config: ConfigCaixa = { mensalidadeCentavos: 7_500, saldoInicialCentavos: 35_000, dataSaldoInicial: '2026-10-01' };

describe('entradaDaMensalidade', () => {
  it('FIN-16: Toninho em 2026-10 marcado em 2026-11-02 dá a entrada com a data de hoje e o valor da configuração', () => {
    expect(entradaDaMensalidade(config, 'Toninho', '2026-10', '2026-11-02')).toEqual({
      tipo: 'entrada',
      data: '2026-11-02',
      descricao: 'Mensalidade Toninho 10/2026',
      valorCentavos: 7_500,
    });
  });

  it('FIN-16: o valor vem da configuração vigente', () => {
    const outra: ConfigCaixa = { ...config, mensalidadeCentavos: 99_999_999 };
    expect(entradaDaMensalidade(outra, 'Zé', '2027-01', '2027-01-31')?.valorCentavos).toBe(99_999_999);
    expect(entradaDaMensalidade(outra, 'Zé', '2027-01', '2027-01-31')?.descricao).toBe('Mensalidade Zé 01/2027');
  });

  it('FIN-17: mensalidade nula devolve nulo (só o pagamento é gravado)', () => {
    expect(entradaDaMensalidade({ ...config, mensalidadeCentavos: null }, 'Toninho', '2026-10', '2026-10-05')).toBeNull();
  });

  it('FIN-17: sem configuração devolve nulo', () => {
    expect(entradaDaMensalidade(null, 'Toninho', '2026-10', '2026-10-05')).toBeNull();
  });
});
