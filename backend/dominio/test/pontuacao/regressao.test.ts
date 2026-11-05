import { describe, expect, it } from 'vitest';
import { acumuladoPorInicio } from '../../src/pontuacao/acumulado.ts';
import {
  PESOS_PADRAO,
  type ConfigPesos,
  type PresencaDoJogador,
} from '../../src/pontuacao/pesos.ts';

/**
 * Regressão com os casos do legado (T6; PAR-57, PAR-58, PAR-59; AD-041). Só as entradas e os valores esperados vêm da
 * origem, como dado; o código do teste é escrito do zero.
 *
 * | Caso | Origem (`ljs:` @ `c6dc82c`) |
 * |---|---|
 * | Vandré: presenças, inicial 30 | `backend/dominio/test/pontuacao/acumulado.test.ts:26-27` |
 * | Vandré: sem S, até 11/10 = 33 e até 26/09 = 31 | `acumulado.test.ts:32-36` |
 * | Vandré: S na primeira presença = 33 | `acumulado.test.ts:38-40` |
 * | Vandré: recuar antes da primeira presença não muda | `acumulado.test.ts:42-44` |
 * | Vandré: S um dia depois da primeira = 2 | `acumulado.test.ts:57-60` |
 * | Kim (início hoje): 0; voltar a S = 33 | `acumulado.test.ts:46-49` |
 * | Saiu e voltou (Kim, 21 presenças no 1º período, retorno 04/10/2026) | `acumulado.test.ts:185-201` |
 * | Saiu e voltou: hoje = 2; dia do retorno = 1 | `acumulado.test.ts:203-209` |
 * | Saiu e voltou: PTS INICIAL do mês do retorno = 0 | `acumulado.test.ts:211-213` |
 * | Saiu e voltou: inicial 50 não vale depois do retorno = 2 | `acumulado.test.ts:215-217` |
 * | Saiu e voltou: meses do 1º período inalterados (21; 71 com a inicial) | `acumulado.test.ts:219-223` |
 * | Saiu e voltou: entre a saída e o retorno = 21 | `acumulado.test.ts:225-227` |
 * | Retorno sem presença antes mantém a inicial = 52 | `acumulado.test.ts:253-263` |
 * | Pesos: padrão desde 05/02/2026; chuva vale 2 desde 01/10/2026 | `acumulado.test.ts:16-17` |
 */

const CONFIGS: ConfigPesos[] = [
  { ...PESOS_PADRAO, vigenteDesde: '2026-02-05' },
  { ...PESOS_PADRAO, presencaComChuva: 2, vigenteDesde: '2026-10-01' },
];

const presente = (data: string): PresencaDoJogador => ({
  data,
  choveu: false,
  situacao: 'presente',
});

const VANDRE = ['2026-09-20', '2026-09-27', '2026-10-11'].map(presente);

describe('regressão: Vandré (PAR-58, PAR-59)', () => {
  it.each<[string, string | undefined, string, number]>([
    ['sem S, até a última presença', undefined, '2026-10-11', 33],
    ['sem S, até 26/09', undefined, '2026-09-26', 31],
    ['S na primeira presença', '2026-09-20', '2026-10-20', 33],
    ['S recuado para 01/08, sem lançamento no intervalo', '2026-08-01', '2026-10-20', 33],
    ['S um dia depois da primeira presença', '2026-09-21', '2026-10-20', 2],
  ])('PAR-58: Vandré, %s', (_nome, inicio, referencia, esperado) => {
    expect(
      acumuladoPorInicio({
        inicio,
        pontuacaoInicial: 30,
        presencas: VANDRE,
        configs: CONFIGS,
        referencia,
      }),
    ).toBe(esperado);
  });
});

describe('regressão: Kim, início hoje (PAR-58, PAR-59)', () => {
  it('PAR-58: data de início hoje dá 0, inclusive a inicial; voltar a S devolve 33', () => {
    const conta = (inicio: string) =>
      acumuladoPorInicio({
        inicio,
        pontuacaoInicial: 30,
        presencas: VANDRE,
        configs: CONFIGS,
        referencia: '2026-10-20',
      });
    expect(conta('2026-10-20')).toBe(0);
    expect(conta('2026-09-20')).toBe(33);
  });
});

describe('regressão: saiu e voltou (PAR-57, PAR-58, PAR-59)', () => {
  const PERIODOS = [{ inicio: '2022-07-03' }, { inicio: '2026-10-04' }];
  // 21 presenças semanais de julho de 2022 em diante, nos dias 03, 10, 17 e 24 de cada mês (a mesma geração da origem).
  const ANTIGAS = Array.from({ length: 21 }, (_, i) =>
    presente(
      `2022-${String(7 + Math.floor(i / 4)).padStart(2, '0')}-${String(3 + (i % 4) * 7).padStart(2, '0')}`,
    ),
  );
  const KIM = [...ANTIGAS, presente('2026-10-04'), presente('2026-10-11')];

  const conta = (referencia: string, inicial = 0, periodoEm?: string) =>
    acumuladoPorInicio({
      inicio: '2022-07-03',
      pontuacaoInicial: inicial,
      presencas: KIM,
      configs: CONFIGS,
      referencia,
      periodos: PERIODOS,
      periodoEm,
    });

  it('PAR-58: hoje, depois do retorno, conta só o período atual (2)', () => {
    expect(conta('2026-10-22')).toBe(2);
  });

  it('PAR-58: no dia do retorno a contagem já recomeça (1)', () => {
    expect(conta('2026-10-04')).toBe(1);
  });

  it('PAR-57: no mês do retorno, PTS INICIAL 0 sem a inicial, porque havia presença antes', () => {
    expect(conta('2026-09-30', 50, '2026-10-31')).toBe(0);
    expect(conta('2026-10-22', 50)).toBe(2);
  });

  it('PAR-57: meses do primeiro período ficam inalterados', () => {
    const ate = (d: string) => ANTIGAS.filter((x) => x.data <= d).length;
    expect(conta('2023-02-28')).toBe(ate('2023-02-28'));
    expect(conta('2023-08-28')).toBe(21);
    expect(conta('2023-08-28', 50)).toBe(71);
  });

  it('PAR-57: entre a saída e o retorno ainda vale o primeiro período (21)', () => {
    expect(conta('2025-01-01')).toBe(21);
  });

  it('PAR-59: retorno sem presença antes dele mantém a inicial (52)', () => {
    expect(
      acumuladoPorInicio({
        inicio: '2026-01-01',
        pontuacaoInicial: 50,
        presencas: [presente('2026-10-04'), presente('2026-10-11')],
        configs: CONFIGS,
        referencia: '2026-10-22',
        periodos: [{ inicio: '2026-01-01' }, { inicio: '2026-10-04' }],
      }),
    ).toBe(52);
  });
});
