import { describe, expect, it } from 'vitest';
import { avaliarInicio, MENSAGEM_ANTES_DO_PISO, type EntradaInicio } from '../../src/atividade/avaliar-inicio.ts';
import type { Periodo } from '../../src/atividade/datas.ts';

/**
 * Data de início da pontuação (T15; GEL-78 a GEL-82).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 31/12/1999 recusada; 01/01/2000 aceita.
 * - Hoje aceita; amanhã recusada.
 * - Igual à saída do primeiro período aceita (o texto diz "depois"); um dia depois recusada.
 * - Primeiro período ainda aberto: sem limite pela saída.
 * - Data igual à atual: sem gravar (GEL-82).
 * - Data posterior ao início do primeiro período e antes da saída: grava sem mover o período.
 */

const HOJE = '2026-10-15';
const ENCERRADO_E_ABERTO: Periodo[] = [
  { id: 'p1', inicio: '2026-02-05', fim: '2026-06-01' },
  { id: 'p2', inicio: '2026-06-10', fim: null },
];
const ABERTO: Periodo[] = [{ id: 'p1', inicio: '2026-02-05', fim: null }];

function entrada(novaData: unknown, extra: Partial<EntradaInicio> = {}): EntradaInicio {
  return { periodos: ENCERRADO_E_ABERTO, inicioPontuacao: '2026-02-05', novaData, hoje: HOJE, ...extra };
}

describe('validações da data de início', () => {
  it('GEL-78: 31/12/1999 dá "A data de início não pode ser anterior a 01/01/2000."', () => {
    expect(avaliarInicio(entrada('1999-12-31'))).toEqual({
      ok: false,
      regra: 'antes-do-piso',
      mensagem: 'A data de início não pode ser anterior a 01/01/2000.',
      campo: 'data',
    });
    expect(MENSAGEM_ANTES_DO_PISO).toBe('A data de início não pode ser anterior a 01/01/2000.');
  });

  it('GEL-78: 01/01/2000 é aceita', () => {
    expect(avaliarInicio(entrada('2000-01-01'))).toMatchObject({ ok: true, alterado: true, inicioPontuacao: '2000-01-01' });
  });

  it('GEL-79: amanhã dá "A data não pode ser no futuro."', () => {
    expect(avaliarInicio(entrada('2026-10-16', { periodos: ABERTO }))).toEqual({
      ok: false,
      regra: 'futuro',
      mensagem: 'A data não pode ser no futuro.',
      campo: 'data',
    });
  });

  it('GEL-79: hoje é aceita com o primeiro período aberto', () => {
    expect(avaliarInicio(entrada(HOJE, { periodos: ABERTO }))).toMatchObject({ ok: true, alterado: true });
  });

  it('GEL-80: um dia depois da saída do primeiro período dá a mensagem com a saída', () => {
    expect(avaliarInicio(entrada('2026-06-02'))).toEqual({
      ok: false,
      regra: 'depois-da-saida-do-primeiro',
      mensagem:
        'A data de início não pode ficar depois da saída do primeiro período (01/06/2026). Corrija antes a data de saída do primeiro período.',
      campo: 'data',
    });
  });

  it('GEL-80: igual à saída do primeiro período é aceita', () => {
    expect(avaliarInicio(entrada('2026-06-01'))).toMatchObject({ ok: true, alterado: true, inicioPontuacao: '2026-06-01' });
  });

  it('GEL-63: data que não existe dá "Informe uma data válida."', () => {
    expect(avaliarInicio(entrada('2026-02-30'))).toMatchObject({ regra: 'data-invalida', mensagem: 'Informe uma data válida.' });
  });
});

describe('efeito da nova data de início', () => {
  it('GEL-81: recuar de 05/02 para 01/02 move o início do primeiro período e não muda os encerrados', () => {
    const tres: Periodo[] = [
      { id: 'p1', inicio: '2026-02-05', fim: '2026-04-01' },
      { id: 'p2', inicio: '2026-05-01', fim: '2026-06-01' },
      { id: 'p3', inicio: '2026-06-10', fim: null },
    ];
    expect(avaliarInicio(entrada('2026-02-01', { periodos: tres }))).toEqual({
      ok: true,
      alterado: true,
      anterior: '2026-02-05',
      inicioPontuacao: '2026-02-01',
      periodos: [
        { id: 'p1', inicio: '2026-02-01', fim: '2026-04-01' },
        { id: 'p2', inicio: '2026-05-01', fim: '2026-06-01' },
        { id: 'p3', inicio: '2026-06-10', fim: null },
      ],
    });
  });

  it('GEL-81: avançar dentro do primeiro período grava a data sem mover o período', () => {
    expect(avaliarInicio(entrada('2026-03-01'))).toEqual({
      ok: true,
      alterado: true,
      anterior: '2026-02-05',
      inicioPontuacao: '2026-03-01',
      periodos: ENCERRADO_E_ABERTO,
    });
  });

  it('GEL-82: data igual à atual devolve alterado false', () => {
    expect(avaliarInicio(entrada('2026-02-05'))).toEqual({
      ok: true,
      alterado: false,
      inicioPontuacao: '2026-02-05',
      periodos: ENCERRADO_E_ABERTO,
    });
  });

  it('GEL-82: com inicio_pontuacao nulo, a atual é o início do primeiro período', () => {
    expect(avaliarInicio(entrada('2026-02-05', { inicioPontuacao: null }))).toMatchObject({ ok: true, alterado: false });
  });
});
