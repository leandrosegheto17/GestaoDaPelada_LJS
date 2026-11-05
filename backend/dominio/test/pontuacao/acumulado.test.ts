import { afterEach, describe, expect, it, vi } from 'vitest';
import * as dominio from '../../src/index.ts';
import { acumuladoPorInicio, type EntradaAcumulado } from '../../src/pontuacao/acumulado.ts';
import { PESOS_PADRAO, type ConfigPesos, type PresencaDoJogador } from '../../src/pontuacao/pesos.ts';
import { criarResolvedorDePesos } from '../../src/pontuacao/resolvedor.ts';

/**
 * Função única de acumulado (T5; PAR-58, PAR-59, PAR-60, PAR-61).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - S igual à primeira presença soma a inicial; S um dia depois, não (`B:487`);
 * - sem presença, a inicial vale com qualquer S (`B:488`);
 * - S posterior à primeira presença: inicial fora (`B:486`);
 * - presenças fora de ordem: a primeira é a de menor data;
 * - limites inclusivos: presença em S e em D entram;
 * - D anterior a S: só a inicial, quando ela vale;
 * - presença fora de período, entre o início da contagem e D, conta (`B:497`);
 * - início hoje: acumulado 0, inclusive a inicial; recuar volta ao valor anterior (Kim, `B:501`);
 * - acumulado negativo; resolvedor pronto no lugar das configurações; relógio do sistema não muda nada.
 */

const antiga: ConfigPesos = { ...PESOS_PADRAO, vigenteDesde: '2026-02-05' };
const nova: ConfigPesos = { ...PESOS_PADRAO, presencaComChuva: 2, vigenteDesde: '2026-10-01' };
const p = (data: string, choveu = false, situacao: PresencaDoJogador['situacao'] = 'presente'): PresencaDoJogador => ({
  data,
  choveu,
  situacao,
});

/** Presenças em 20/09, 27/09 e 11/10, pontuação inicial 30. */
const TRES = [p('2026-09-20'), p('2026-09-27'), p('2026-10-11')];

function conta(inicio: string | undefined, presencas: PresencaDoJogador[], referencia: string, inicial = 30, extra: Partial<EntradaAcumulado> = {}) {
  return acumuladoPorInicio({ inicio, pontuacaoInicial: inicial, presencas, configs: [antiga, nova], referencia, ...extra });
}

describe('pontuação inicial (PAR-59)', () => {
  it('PAR-59: S igual à primeira presença soma a inicial; S um dia depois, não', () => {
    expect(conta('2026-09-20', TRES, '2026-10-20')).toBe(33);
    expect(conta('2026-09-21', TRES, '2026-10-20')).toBe(2);
  });

  it('PAR-59: sem presença, soma a inicial com qualquer S', () => {
    expect(conta('2026-10-20', [], '2026-10-25')).toBe(30);
    expect(conta('2000-01-01', [], '2026-10-25')).toBe(30);
    expect(conta('2026-10-20', [], '2026-01-01')).toBe(30);
  });

  it('PAR-59: a primeira presença é a de menor data, mesmo fora de ordem', () => {
    const foraDeOrdem = [p('2026-10-11'), p('2026-09-27'), p('2026-09-20')];
    expect(conta('2026-09-20', foraDeOrdem, '2026-10-20')).toBe(33);
    expect(conta('2026-09-21', foraDeOrdem, '2026-10-20')).toBe(2);
  });

  it('PAR-59: D anterior a S soma só a inicial, quando ela vale', () => {
    expect(conta('2026-09-20', TRES, '2026-09-01')).toBe(30);
    expect(conta('2026-09-27', TRES, '2026-09-01')).toBe(0);
  });
});

describe('soma do início da contagem até D (PAR-58)', () => {
  it('PAR-58: limites inclusivos nas duas pontas', () => {
    expect(conta('2026-09-27', TRES, '2026-09-27', 0)).toBe(1);
    expect(conta('2026-09-20', TRES, '2026-10-11', 0)).toBe(3);
    expect(conta('2026-09-20', TRES, '2026-10-10', 0)).toBe(2);
  });

  it('PAR-58: sem S soma a inicial e todas as presenças até D', () => {
    expect(conta(undefined, TRES, '2026-10-11')).toBe(33);
    expect(conta(undefined, TRES, '2026-09-26')).toBe(31);
  });

  it('PAR-58: data de início hoje dá acumulado 0 e recuar volta ao valor anterior (Kim)', () => {
    expect(conta('2026-10-20', TRES, '2026-10-20')).toBe(0);
    expect(conta('2026-09-20', TRES, '2026-10-20')).toBe(33);
  });

  it('PAR-58: pesos pela data de cada partida e acumulado negativo', () => {
    expect(conta(undefined, [p('2026-09-30', true), p('2026-10-01', true)], '2026-10-20', 0)).toBe(1 + 2);
    expect(conta(undefined, [p('2026-03-01', false, 'expulso'), p('2026-03-08', true, 'expulso')], '2026-12-31', 0)).toBe(-2);
  });

  it('PAR-58: o resolvedor pronto dá o mesmo resultado das configurações', () => {
    const resolvedor = criarResolvedorDePesos([antiga, nova]);
    expect(
      acumuladoPorInicio({ inicio: '2026-09-27', pontuacaoInicial: 0, presencas: TRES, configs: resolvedor, referencia: '2026-10-20' }),
    ).toBe(2);
  });
});

describe('presença fora de período (PAR-60)', () => {
  it('PAR-60: presença fora de período, dentro de [início da contagem, D], conta', () => {
    // Um só período, desde 01/09; a presença de 15/08 é anterior a ele, mas depois de S (01/08).
    const total = conta('2026-08-01', [p('2026-08-15'), p('2026-09-20')], '2026-10-20', 10, {
      periodos: [{ inicio: '2026-09-01' }],
    });
    expect(total).toBe(12);
  });
});

describe('saiu e voltou (PAR-57 dentro da função única)', () => {
  const periodos = [{ inicio: '2026-02-05' }, { inicio: '2026-10-04' }];
  const presencas = [p('2026-03-01'), p('2026-03-08'), p('2026-10-04'), p('2026-10-11')];

  it('PAR-58: depois do retorno soma só o período atual, sem a inicial', () => {
    expect(conta('2026-02-05', presencas, '2026-10-22', 50, { periodos })).toBe(2);
  });

  it('PAR-58: periodoEm escolhe o período: PTS INICIAL do mês do retorno é 0', () => {
    expect(conta('2026-02-05', presencas, '2026-09-30', 50, { periodos, periodoEm: '2026-10-31' })).toBe(0);
  });

  it('PAR-58: antes do retorno vale o primeiro período, com a inicial', () => {
    expect(conta('2026-02-05', presencas, '2026-09-30', 50, { periodos })).toBe(52);
  });
});

describe('função única (PAR-61)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('PAR-61: o index.ts exporta acumuladoPorInicio e não as somas internas', () => {
    expect(typeof dominio.acumuladoPorInicio).toBe('function');
    expect(dominio).not.toHaveProperty('acumuladoAte');
    expect(dominio).not.toHaveProperty('acumuladoComInicial');
  });

  it('PAR-61: não lê o relógio', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
    const antes = conta('2026-09-20', TRES, '2026-10-20');
    vi.setSystemTime(new Date('2031-01-01T12:00:00Z'));
    expect(conta('2026-09-20', TRES, '2026-10-20')).toBe(antes);
  });
});
