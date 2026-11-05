import { describe, expect, it } from 'vitest';
import { inicioDaContagem } from '../../src/pontuacao/inicio.ts';

/**
 * Início da contagem (T4; PAR-57).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - sem período (ou lista vazia): S;
 * - um período só: S, em qualquer X;
 * - saiu e voltou: X antes do retorno dá S; X no dia do retorno ou depois dá o retorno;
 * - X antes de qualquer período: S;
 * - três períodos: o mais recente com início até X;
 * - sair e voltar no mesmo dia (GEL-61: [a, d) e [d, ...)): o retorno é o início;
 * - períodos fora de ordem; S ausente no primeiro período: sem limite (undefined).
 */

const S = '2026-02-05';

describe('inicioDaContagem', () => {
  it('PAR-57: sem período, S', () => {
    expect(inicioDaContagem(S, undefined, '2026-10-15')).toBe(S);
    expect(inicioDaContagem(S, [], '2026-10-15')).toBe(S);
  });

  it('PAR-57: um período, S', () => {
    expect(inicioDaContagem(S, [{ inicio: '2026-02-05' }], '2026-10-15')).toBe(S);
  });

  it('PAR-57: saiu e voltou, a data do retorno para X depois dele e S para X antes', () => {
    const periodos = [{ inicio: '2026-02-05' }, { inicio: '2026-08-01' }];
    expect(inicioDaContagem(S, periodos, '2026-10-15')).toBe('2026-08-01');
    expect(inicioDaContagem(S, periodos, '2026-08-01')).toBe('2026-08-01');
    expect(inicioDaContagem(S, periodos, '2026-07-31')).toBe(S);
  });

  it('PAR-57: sair e voltar no mesmo dia (GEL-61) dá o retorno como início', () => {
    const periodos = [{ inicio: '2026-02-05' }, { inicio: '2026-06-10' }];
    // O primeiro período [2026-02-05, 2026-06-10) termina no mesmo dia em que o segundo começa.
    expect(inicioDaContagem(S, periodos, '2026-06-10')).toBe('2026-06-10');
  });

  it('PAR-57: X antes de qualquer período dá S', () => {
    expect(inicioDaContagem(S, [{ inicio: '2026-03-01' }, { inicio: '2026-08-01' }], '2026-02-10')).toBe(S);
  });

  it('PAR-57: com três períodos vale o mais recente com início até X, em qualquer ordem', () => {
    const periodos = [{ inicio: '2026-09-01' }, { inicio: '2026-01-01' }, { inicio: '2026-05-01' }];
    expect(inicioDaContagem(S, periodos, '2026-06-15')).toBe('2026-05-01');
    expect(inicioDaContagem(S, periodos, '2026-10-15')).toBe('2026-09-01');
    expect(inicioDaContagem(S, periodos, '2026-03-15')).toBe(S);
  });

  it('PAR-57: sem S, no primeiro período não há limite; no retorno, o retorno', () => {
    const periodos = [{ inicio: '2026-01-01' }, { inicio: '2026-08-01' }];
    expect(inicioDaContagem(undefined, periodos, '2026-03-01')).toBeUndefined();
    expect(inicioDaContagem(undefined, periodos, '2026-10-01')).toBe('2026-08-01');
  });
});
