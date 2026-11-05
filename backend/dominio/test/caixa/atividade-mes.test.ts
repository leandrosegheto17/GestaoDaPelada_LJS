import { describe, expect, it } from 'vitest';
import { ativoNoMes, ativosNoMes, type JogadorComPeriodos } from '../../src/caixa/atividade-mes.ts';

/** Ativo no mês do caixa (T2; FIN-12, FIN-11, FIN-19). Período [início, fim). */

const jogador = (jogadorId: string, apelido: string, ...periodos: JogadorComPeriodos['periodos']): JogadorComPeriodos => ({
  jogadorId,
  apelido,
  periodos,
});

describe('ativoNoMes', () => {
  it('FIN-12: período [2026-10-31, aberto) é ativo em outubro', () => {
    expect(ativoNoMes([{ inicio: '2026-10-31', fim: null }], '2026-10')).toBe(true);
  });

  it('FIN-12: período [2026-09-01, 2026-10-01) não é ativo em outubro', () => {
    expect(ativoNoMes([{ inicio: '2026-09-01', fim: '2026-10-01' }], '2026-10')).toBe(false);
  });

  it('FIN-12: saída em 2026-10-02 conta outubro (ativo no dia 1)', () => {
    expect(ativoNoMes([{ inicio: '2026-09-01', fim: '2026-10-02' }], '2026-10')).toBe(true);
  });

  it('FIN-12: início em novembro não é ativo em outubro', () => {
    expect(ativoNoMes([{ inicio: '2026-11-01', fim: null }], '2026-10')).toBe(false);
  });

  it('FIN-12: período fechado dentro do mês é ativo', () => {
    expect(ativoNoMes([{ inicio: '2026-10-10', fim: '2026-10-15' }], '2026-10')).toBe(true);
  });

  it('FIN-12: período que atravessa o mês inteiro é ativo', () => {
    expect(ativoNoMes([{ inicio: '2026-01-01', fim: '2027-01-01' }], '2026-10')).toBe(true);
  });

  it('FIN-12: período vazio (início = fim) não cobre nenhum dia', () => {
    expect(ativoNoMes([{ inicio: '2026-10-10', fim: '2026-10-10' }], '2026-10')).toBe(false);
  });

  it('FIN-12: fevereiro bissexto vai até o dia 29', () => {
    expect(ativoNoMes([{ inicio: '2028-02-29', fim: null }], '2028-02')).toBe(true);
    expect(ativoNoMes([{ inicio: '2028-03-01', fim: null }], '2028-02')).toBe(false);
  });

  it('FIN-19: sem períodos não é ativo', () => {
    expect(ativoNoMes([], '2026-10')).toBe(false);
  });
});

describe('ativosNoMes', () => {
  it('FIN-12: saiu em 10/10 e voltou em 20/10 conta uma vez', () => {
    const ativos = ativosNoMes(
      [jogador('j1', 'Toninho', { inicio: '2026-01-01', fim: '2026-10-10' }, { inicio: '2026-10-20', fim: null })],
      '2026-10',
    );
    expect(ativos).toEqual([{ jogadorId: 'j1', apelido: 'Toninho' }]);
  });

  it('FIN-12: o mesmo jogador em linhas repetidas (uma por período) conta uma vez', () => {
    const ativos = ativosNoMes(
      [
        jogador('j1', 'Toninho', { inicio: '2026-01-01', fim: '2026-10-10' }),
        jogador('j1', 'Toninho', { inicio: '2026-10-20', fim: null }),
      ],
      '2026-10',
    );
    expect(ativos).toEqual([{ jogadorId: 'j1', apelido: 'Toninho' }]);
  });

  it('FIN-12: ["Zé", "ana", "Álvaro"] sai em Álvaro, ana, Zé', () => {
    const aberto = { inicio: '2026-01-01', fim: null };
    const ativos = ativosNoMes(
      [jogador('j1', 'Zé', aberto), jogador('j2', 'ana', aberto), jogador('j3', 'Álvaro', aberto)],
      '2026-10',
    );
    expect(ativos.map((a) => a.apelido)).toEqual(['Álvaro', 'ana', 'Zé']);
  });

  it('FIN-11: inativo no mês fica de fora', () => {
    const ativos = ativosNoMes(
      [
        jogador('j1', 'Ativo', { inicio: '2026-01-01', fim: null }),
        jogador('j2', 'Saiu', { inicio: '2026-01-01', fim: '2026-10-01' }),
      ],
      '2026-10',
    );
    expect(ativos.map((a) => a.jogadorId)).toEqual(['j1']);
  });
});
