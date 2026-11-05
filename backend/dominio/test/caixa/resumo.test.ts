import { describe, expect, it } from 'vitest';
import { ErroEstouroCentavos } from '../../src/caixa/centavos.ts';
import { resumoDoMes, type AtivoNoMes } from '../../src/caixa/resumo.ts';
import type { MovimentoCaixa } from '../../src/caixa/saldos.ts';

/** Resumo do mês e "não pagaram" (T4; FIN-11, FIN-12, FIN-13, FIN-16). Os ativos chegam já filtrados e ordenados (T2). */

const ativos = (n: number): AtivoNoMes[] =>
  Array.from({ length: n }, (_, i) => ({
    jogadorId: `j${String(i + 1).padStart(2, '0')}`,
    apelido: `Jogador ${i + 1}`,
  }));

const entrada = (data: string, valorCentavos: number): MovimentoCaixa => ({
  tipo: 'entrada',
  data,
  valorCentavos,
});
const saida = (data: string, valorCentavos: number): MovimentoCaixa => ({
  tipo: 'saida',
  data,
  valorCentavos,
});

describe('resumoDoMes', () => {
  it('FIN-11: 20 ativos, 16 pagos, mensalidade 7.500 e saída 90.000 (Independent Test de S:90)', () => {
    const elenco = ativos(20);
    const pagos = elenco.slice(0, 16).map((a) => a.jogadorId);
    const lancamentos = [
      ...pagos.map(() => entrada('2026-10-05', 7_500)),
      saida('2026-10-10', 90_000),
    ];

    const { resumo, pagamentos } = resumoDoMes(lancamentos, elenco, pagos, '2026-10');

    expect(resumo).toEqual({
      entradasCentavos: 120_000,
      saidasCentavos: 90_000,
      resultadoCentavos: 30_000,
      naoPagaram: 4,
    });
    expect(pagamentos).toHaveLength(20);
    expect(pagamentos.filter((p) => p.pagou)).toHaveLength(16);
  });

  it('FIN-11: só os lançamentos com data no mês entram nas somas', () => {
    const lancamentos = [
      entrada('2026-09-30', 1_000),
      entrada('2026-10-01', 7_500),
      saida('2026-10-31', 500),
      saida('2026-11-01', 9_999),
    ];
    const { resumo } = resumoDoMes(lancamentos, [], [], '2026-10');
    expect(resumo).toEqual({
      entradasCentavos: 7_500,
      saidasCentavos: 500,
      resultadoCentavos: 7_000,
      naoPagaram: 0,
    });
  });

  it('FIN-11: resultado negativo quando as saídas passam das entradas', () => {
    const { resumo } = resumoDoMes([saida('2026-10-10', 80_000)], [], [], '2026-10');
    expect(resumo.resultadoCentavos).toBe(-80_000);
  });

  it('FIN-11: pagamento de jogador inativo no mês não reduz "não pagaram" e não entra na lista', () => {
    const elenco = ativos(3);
    const { resumo, pagamentos } = resumoDoMes([], elenco, ['inativo', 'j01'], '2026-10');
    expect(resumo.naoPagaram).toBe(2);
    expect(pagamentos.map((p) => p.jogadorId)).toEqual(['j01', 'j02', 'j03']);
    expect(pagamentos.find((p) => p.jogadorId === 'inativo')).toBeUndefined();
  });

  it('FIN-12: a lista mantém a ordem dos ativos e marca pagou verdadeiro ou falso', () => {
    const elenco: AtivoNoMes[] = [
      { jogadorId: 'a', apelido: 'Álvaro' },
      { jogadorId: 'b', apelido: 'ana' },
      { jogadorId: 'c', apelido: 'Zé' },
    ];
    expect(resumoDoMes([], elenco, ['b'], '2026-10').pagamentos).toEqual([
      { jogadorId: 'a', apelido: 'Álvaro', pagou: false },
      { jogadorId: 'b', apelido: 'ana', pagou: true },
      { jogadorId: 'c', apelido: 'Zé', pagou: false },
    ]);
  });

  it('FIN-12: jogador que saiu e voltou no mês, repetido na entrada, conta uma vez', () => {
    const elenco: AtivoNoMes[] = [
      { jogadorId: 'a', apelido: 'Toninho' },
      { jogadorId: 'a', apelido: 'Toninho' },
    ];
    const { resumo, pagamentos } = resumoDoMes([], elenco, [], '2026-10');
    expect(resumo.naoPagaram).toBe(1);
    expect(pagamentos).toHaveLength(1);
  });

  it('FIN-16: pagamento de setembro marcado em outubro conta nas entradas de outubro', () => {
    // Regime de caixa: a entrada da mensalidade de 09/2026 tem a data do dia em que foi marcada.
    const lancamentos = [entrada('2026-10-03', 7_500)];
    expect(resumoDoMes(lancamentos, [], [], '2026-10').resumo.entradasCentavos).toBe(7_500);
    expect(resumoDoMes(lancamentos, [], [], '2026-09').resumo.entradasCentavos).toBe(0);
  });

  it('FIN-13: soma acima do teto de entrada continua exata', () => {
    const lancamentos = Array.from({ length: 200 }, () => entrada('2026-10-02', 99_999_999));
    expect(resumoDoMes(lancamentos, [], [], '2026-10').resumo.entradasCentavos).toBe(
      19_999_999_800,
    );
  });

  it('FIN-13: estouro do inteiro seguro lança', () => {
    const lancamentos = [entrada('2026-10-02', Number.MAX_SAFE_INTEGER), entrada('2026-10-03', 1)];
    expect(() => resumoDoMes(lancamentos, [], [], '2026-10')).toThrow(ErroEstouroCentavos);
  });
});
