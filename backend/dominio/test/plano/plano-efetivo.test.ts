import { describe, expect, it } from 'vitest';
import {
  fimDoTrial,
  planoEfetivo,
  SITUACOES_COMERCIAIS,
  ultimoDiaDoTrial,
  type SituacaoComercial,
} from '../../src/plano/plano-efetivo.ts';

/**
 * Plano efetivo (T1; PLA-01 a PLA-04, PLA-70, PLA-71).
 *
 * Casos limite listados antes do código: cada uma das 5 situações; hoje antes, igual e depois de `fimDoTrial` e de
 * `pagoAte`; `trial_inicio` no futuro; `cancelado` sem `pagoAte`; virada do mês e do ano.
 */

describe('planoEfetivo', () => {
  it('PLA-02: uso_proprio é cortesia em qualquer data, sem olhar trial nem pagoAte', () => {
    expect(planoEfetivo('uso_proprio', null, null, '2026-11-05')).toBe('cortesia');
    expect(planoEfetivo('uso_proprio', null, null, '2099-12-31')).toBe('cortesia');
    expect(planoEfetivo('uso_proprio', '2020-01-01', '2020-01-01', '2026-11-05')).toBe('cortesia');
  });

  it('PLA-03: criado em 2026-11-01 é trial até 2026-11-14 e free em 2026-11-15', () => {
    expect(planoEfetivo('trial', '2026-11-01', null, '2026-11-01')).toBe('trial');
    expect(planoEfetivo('trial', '2026-11-01', null, '2026-11-13')).toBe('trial');
    expect(planoEfetivo('trial', '2026-11-01', null, '2026-11-14')).toBe('trial');
    expect(planoEfetivo('trial', '2026-11-01', null, '2026-11-15')).toBe('free');
    expect(planoEfetivo('trial', '2026-11-01', null, '2027-03-01')).toBe('free');
  });

  it('PLA-03: o trial atravessa a virada do mês e do ano pelo calendário', () => {
    expect(planoEfetivo('trial', '2026-12-25', null, '2027-01-07')).toBe('trial');
    expect(planoEfetivo('trial', '2026-12-25', null, '2027-01-08')).toBe('free');
    expect(planoEfetivo('trial', '2028-02-20', null, '2028-03-04')).toBe('trial');
    expect(planoEfetivo('trial', '2028-02-20', null, '2028-03-05')).toBe('free');
  });

  it('PLA-03: fimDoTrial é o primeiro dia Free e ultimoDiaDoTrial o 14º dia', () => {
    expect(fimDoTrial('2026-11-01')).toBe('2026-11-15');
    expect(ultimoDiaDoTrial('2026-11-01')).toBe('2026-11-14');
    expect(fimDoTrial('2026-12-25')).toBe('2027-01-08');
  });

  it('PLA-04: ativo é pro, mesmo com pagoAte vencido (quem rebaixa é o webhook)', () => {
    expect(planoEfetivo('ativo', null, '2026-12-04', '2026-11-05')).toBe('pro');
    expect(planoEfetivo('ativo', null, '2026-01-01', '2026-11-05')).toBe('pro');
  });

  it('PLA-04: inadimplente é free, com ou sem pagoAte no futuro', () => {
    expect(planoEfetivo('inadimplente', null, null, '2026-11-05')).toBe('free');
    expect(planoEfetivo('inadimplente', null, '2026-12-10', '2026-11-05')).toBe('free');
  });

  it('PLA-04: cancelado com pagoAte 2026-12-10 é pro em 12-10 e free em 12-11', () => {
    expect(planoEfetivo('cancelado', null, '2026-12-10', '2026-12-09')).toBe('pro');
    expect(planoEfetivo('cancelado', null, '2026-12-10', '2026-12-10')).toBe('pro');
    expect(planoEfetivo('cancelado', null, '2026-12-10', '2026-12-11')).toBe('free');
  });

  it('PLA-04: cancelado sem pagoAte é free', () => {
    expect(planoEfetivo('cancelado', null, null, '2026-11-05')).toBe('free');
  });

  it('PLA-70: trial_inicio daqui a 3 dias devolve trial, sem erro', () => {
    expect(() => planoEfetivo('trial', '2026-11-08', null, '2026-11-05')).not.toThrow();
    expect(planoEfetivo('trial', '2026-11-08', null, '2026-11-05')).toBe('trial');
  });

  it('trial sem trial_inicio (o CHECK não deixa existir) não libera o Pro', () => {
    expect(planoEfetivo('trial', null, null, '2026-11-05')).toBe('free');
  });

  it('PLA-71: a função recebe a data de SP pronta; o mesmo instante em dias diferentes muda o resultado', () => {
    // 2026-11-14T23:59 em SP ainda é dia 14 (trial); 00:00 de SP já é dia 15 (free). A conversão é do Relógio (T24).
    expect(planoEfetivo('trial', '2026-11-01', null, '2026-11-14')).toBe('trial');
    expect(planoEfetivo('trial', '2026-11-01', null, '2026-11-15')).toBe('free');
  });

  it('PLA-01: toda situação do CHECK tem resultado definido', () => {
    const resultados = SITUACOES_COMERCIAIS.map((s: SituacaoComercial) =>
      planoEfetivo(s, '2026-11-01', '2026-12-01', '2026-11-05'),
    );
    expect(resultados).toEqual(['cortesia', 'trial', 'pro', 'free', 'pro']);
  });

  it('valor fora do CHECK nunca dá Pro', () => {
    expect(planoEfetivo('desconhecido' as SituacaoComercial, null, null, '2026-11-05')).toBe('free');
  });
});
