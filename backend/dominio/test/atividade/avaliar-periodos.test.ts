import { describe, expect, it } from 'vitest';
import {
  avaliarPeriodos,
  EstadoDePeriodoInvalido,
  MENSAGEM_INICIO_DO_PRIMEIRO,
  MENSAGEM_SEM_SAIDA,
  type EntradaAvaliacao,
} from '../../src/atividade/avaliar-periodos.ts';
import type { Periodo } from '../../src/atividade/datas.ts';

/**
 * Avaliação de inativar, reativar e corrigir (T14; GEL-58, GEL-62, GEL-69, GEL-72, GEL-73, GEL-74).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Entrada que viola duas regras ao mesmo tempo: só a primeira, pela ordem do GEL-62, volta (futura + sobreposição;
 *   inválida + não corrigível; não corrigível + futura; ordem + presença).
 * - Corrigir a saída de período aberto: "Este período não tem data de saída." (GEL-72).
 * - Corrigir o início do primeiro período: mensagem do GEL-73.
 * - Saída do primeiro período antes do início da pontuação: GEL-69, com a data de início.
 * - Corrigir com as datas atuais: ok sem alteração (GEL-74).
 * - Inativar sem período aberto ou reativar com período aberto: erro de uso (o repositório responde 409 antes).
 */

const HOJE = '2026-10-15';

function entrada(periodos: Periodo[], operacao: EntradaAvaliacao['operacao'], extra: Partial<EntradaAvaliacao> = {}): EntradaAvaliacao {
  return { periodos, operacao, presencas: [], inicioPontuacao: periodos[0]?.inicio ?? null, hoje: HOJE, ...extra };
}

const ABERTO: Periodo[] = [{ id: 'p1', inicio: '2026-03-01', fim: null }];
const DOIS: Periodo[] = [
  { id: 'p1', inicio: '2026-03-01', fim: '2026-06-01' },
  { id: 'p2', inicio: '2026-06-10', fim: null },
];
const ENCERRADOS: Periodo[] = [
  { id: 'p1', inicio: '2026-03-01', fim: '2026-06-01' },
  { id: 'p2', inicio: '2026-06-10', fim: '2026-09-01' },
];

describe('GEL-58: inativar e reativar válidos', () => {
  it('GEL-58: inativar encerra o período aberto na data de saída', () => {
    expect(avaliarPeriodos(entrada(ABERTO, { tipo: 'inativar', saida: '2026-10-01' }))).toEqual({
      ok: true,
      periodos: [{ id: 'p1', inicio: '2026-03-01', fim: '2026-10-01' }],
      alterado: true,
    });
  });

  it('GEL-58: reativar abre um período novo no fim', () => {
    expect(avaliarPeriodos(entrada(ENCERRADOS, { tipo: 'reativar', retorno: '2026-09-01' }))).toEqual({
      ok: true,
      periodos: [...ENCERRADOS, { inicio: '2026-09-01', fim: null }],
      alterado: true,
    });
  });

  it('GEL-58: reativar antes da saída anterior falha pela regra de ordem', () => {
    expect(avaliarPeriodos(entrada(ENCERRADOS, { tipo: 'reativar', retorno: '2026-08-31' }))).toMatchObject({
      ok: false,
      regra: 'retorno-antes-da-saida-anterior',
      campo: 'retorno',
    });
  });

  it('GEL-58: inativar sem período aberto é erro de uso', () => {
    expect(() => avaliarPeriodos(entrada(ENCERRADOS, { tipo: 'inativar', saida: '2026-10-01' }))).toThrow(EstadoDePeriodoInvalido);
  });

  it('GEL-58: reativar com período aberto é erro de uso', () => {
    expect(() => avaliarPeriodos(entrada(DOIS, { tipo: 'reativar', retorno: '2026-10-01' }))).toThrow(EstadoDePeriodoInvalido);
  });
});

describe('GEL-62: só a primeira falha, na ordem da spec', () => {
  it('GEL-62: data futura e sobreposição juntas devolvem só a de data futura', () => {
    // Retorno em 2026-10-20 é futuro e, se valesse, ficaria antes da saída anterior.
    const periodos: Periodo[] = [{ id: 'p1', inicio: '2026-03-01', fim: '2026-12-01' }];
    expect(avaliarPeriodos(entrada(periodos, { tipo: 'reativar', retorno: '2026-10-20' }))).toEqual({
      ok: false,
      regra: 'futuro',
      mensagem: 'A data não pode ser no futuro.',
      campo: 'retorno',
    });
  });

  it('GEL-62: data inválida vem antes de campo não corrigível', () => {
    expect(avaliarPeriodos(entrada(DOIS, { tipo: 'corrigir', periodoId: 'p2', saida: '2026-02-30' }))).toMatchObject({
      regra: 'data-invalida',
      mensagem: 'Informe uma data válida.',
    });
  });

  it('GEL-62: campo não corrigível vem antes de data futura', () => {
    expect(avaliarPeriodos(entrada(DOIS, { tipo: 'corrigir', periodoId: 'p2', saida: '2026-12-01' }))).toMatchObject({
      regra: 'nao-corrigivel',
    });
  });

  it('GEL-62: ordem vem antes de presença', () => {
    const r = avaliarPeriodos(
      entrada(DOIS, { tipo: 'corrigir', periodoId: 'p1', saida: '2026-02-20' }, { presencas: [{ data: '2026-05-01', situacao: 'presente' }] }),
    );
    expect(r).toMatchObject({ regra: 'saida-antes-do-inicio' });
  });

  it('GEL-62: presença vem antes do início da pontuação', () => {
    const r = avaliarPeriodos(
      entrada(
        DOIS,
        { tipo: 'corrigir', periodoId: 'p1', saida: '2026-03-05' },
        { presencas: [{ data: '2026-05-01', situacao: 'presente' }], inicioPontuacao: '2026-04-01' },
      ),
    );
    expect(r).toMatchObject({ regra: 'presenca' });
  });
});

describe('GEL-72, GEL-73: campo não corrigível', () => {
  it('GEL-72: corrigir a saída de período aberto dá "Este período não tem data de saída."', () => {
    expect(avaliarPeriodos(entrada(DOIS, { tipo: 'corrigir', periodoId: 'p2', saida: '2026-10-01' }))).toEqual({
      ok: false,
      regra: 'nao-corrigivel',
      mensagem: 'Este período não tem data de saída.',
      campo: 'saida',
    });
    expect(MENSAGEM_SEM_SAIDA).toBe('Este período não tem data de saída.');
  });

  it('GEL-73: corrigir o início do primeiro período dá a mensagem de Alterar data de início', () => {
    expect(avaliarPeriodos(entrada(DOIS, { tipo: 'corrigir', periodoId: 'p1', retorno: '2026-02-01' }))).toEqual({
      ok: false,
      regra: 'nao-corrigivel',
      mensagem: 'O início do primeiro período é a data de início da pontuação; use Alterar data de início.',
      campo: 'retorno',
    });
    expect(MENSAGEM_INICIO_DO_PRIMEIRO).toBe(
      'O início do primeiro período é a data de início da pontuação; use Alterar data de início.',
    );
  });
});

describe('GEL-69: saída do primeiro período antes do início da pontuação', () => {
  it('GEL-69: mensagem exata, com a data de início da pontuação', () => {
    expect(
      avaliarPeriodos(entrada(DOIS, { tipo: 'corrigir', periodoId: 'p1', saida: '2026-03-20' }, { inicioPontuacao: '2026-04-01' })),
    ).toEqual({
      ok: false,
      regra: 'antes-do-inicio-da-pontuacao',
      mensagem:
        'A saída do primeiro período não pode ser antes da data de início da pontuação (01/04/2026). Para ir antes, altere primeiro a data de início.',
      campo: 'saida',
    });
  });

  it('GEL-69: saída no dia do início da pontuação vale', () => {
    expect(
      avaliarPeriodos(entrada(DOIS, { tipo: 'corrigir', periodoId: 'p1', saida: '2026-04-01' }, { inicioPontuacao: '2026-04-01' })),
    ).toMatchObject({ ok: true, alterado: true });
  });

  it('GEL-69: inativar no primeiro período antes do início da pontuação também falha', () => {
    expect(
      avaliarPeriodos(entrada(ABERTO, { tipo: 'inativar', saida: '2026-03-10' }, { inicioPontuacao: '2026-04-01' })),
    ).toMatchObject({ regra: 'antes-do-inicio-da-pontuacao' });
  });
});

describe('GEL-74: corrigir com as datas atuais', () => {
  it('GEL-74: saída e retorno iguais aos atuais devolvem alterado false', () => {
    expect(
      avaliarPeriodos(entrada(ENCERRADOS, { tipo: 'corrigir', periodoId: 'p2', saida: '2026-09-01', retorno: '2026-06-10' })),
    ).toEqual({ ok: true, periodos: ENCERRADOS, alterado: false });
  });

  it('GEL-71: corrigir saída e retorno do segundo período grava as duas', () => {
    expect(
      avaliarPeriodos(entrada(ENCERRADOS, { tipo: 'corrigir', periodoId: 'p2', saida: '2026-08-20', retorno: '2026-06-05' })),
    ).toEqual({
      ok: true,
      periodos: [ENCERRADOS[0], { id: 'p2', inicio: '2026-06-05', fim: '2026-08-20' }],
      alterado: true,
    });
  });
});
