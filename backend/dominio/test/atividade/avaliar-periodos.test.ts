// Critérios: GEL-58 (inativar e reativar passam pelas regras de período), GEL-62 (ordem; só a primeira falha), GEL-69
// (saída do primeiro período antes do início da pontuação), GEL-70 (função pura, `hoje` por parâmetro), GEL-72 (saída
// de período aberto) e GEL-73 (início do primeiro período). Casos adaptados do legado
// (`backend/dominio/test/atividade/avaliar-periodos.test.ts`).
import { describe, expect, it } from 'vitest';
import {
  avaliarPeriodos,
  type EntradaAvaliacao,
  type OperacaoPeriodo,
  type PeriodoEntrada,
  type PresencaJogador,
} from '../../src/index.ts';

const p = (id: string, inicio: string, fim: string | null): PeriodoEntrada => ({ id, inicio, fim });
const presente = (...datas: string[]): PresencaJogador[] => datas.map((data) => ({ data, situacao: 'presente' }));

/** p1 [01/01, 05/10), p2 [20/10, ∞); hoje 21/10/2026; pontuação desde 01/01. */
const dois = (): PeriodoEntrada[] => [p('p1', '2026-01-01', '2026-10-05'), p('p2', '2026-10-20', null)];

function avaliar(operacao: OperacaoPeriodo, extra: Partial<EntradaAvaliacao> = {}) {
  return avaliarPeriodos({
    periodos: dois(),
    operacao,
    hoje: '2026-10-21',
    inicioPontuacao: '2026-01-01',
    presencas: [],
    ...extra,
  });
}

const falha = (regra: string, campo: string, mensagem: string) => ({ ok: false, regra, campo, mensagem });

const MSG_SEM_SAIDA = 'Este período não tem data de saída.';
const MSG_INICIO_PRIMEIRO = 'O início do primeiro período é a data de início da pontuação; use Alterar data de início.';

describe('corrigir: campo não corrigível (GEL-72, GEL-73)', () => {
  it('corrigir a saída de um período aberto → "Este período não tem data de saída."', () => {
    expect(avaliar({ tipo: 'corrigir', periodoId: 'p2', saida: '2026-10-21' })).toEqual(
      falha('nao-corrigivel', 'saida', MSG_SEM_SAIDA),
    );
  });

  it('corrigir o início do primeiro período → mensagem do GEL-73', () => {
    expect(avaliar({ tipo: 'corrigir', periodoId: 'p1', retorno: '2026-01-02' })).toEqual(
      falha('nao-corrigivel', 'retorno', MSG_INICIO_PRIMEIRO),
    );
  });

  it('o início dos períodos seguintes e a saída dos encerrados são corrigíveis', () => {
    expect(avaliar({ tipo: 'corrigir', periodoId: 'p2', retorno: '2026-10-15' })).toEqual({
      ok: true,
      alterado: true,
      periodos: [p('p1', '2026-01-01', '2026-10-05'), p('p2', '2026-10-15', null)],
    });
    expect(avaliar({ tipo: 'corrigir', periodoId: 'p1', saida: '2026-10-10' })).toEqual({
      ok: true,
      alterado: true,
      periodos: [p('p1', '2026-01-01', '2026-10-10'), p('p2', '2026-10-20', null)],
    });
  });

  it('período que não é do jogador é recusado como não corrigível', () => {
    expect(avaliar({ tipo: 'corrigir', periodoId: 'zzz', saida: '2026-10-01' })).toMatchObject({
      ok: false,
      regra: 'nao-corrigivel',
    });
  });
});

describe('corrigir: datas iguais às atuais (GEL-74)', () => {
  it('ok, sem alterar, mesmo com presença que a data atual já deixa de fora', () => {
    const r = avaliar(
      { tipo: 'corrigir', periodoId: 'p1', saida: '2026-10-05' },
      { presencas: presente('2026-10-06') },
    );
    expect(r).toEqual({ ok: true, alterado: false, periodos: dois() });
  });
});

describe('início da pontuação (GEL-69)', () => {
  it('saída do primeiro período antes do início da pontuação → mensagem do GEL-69', () => {
    expect(
      avaliar({ tipo: 'corrigir', periodoId: 'p1', saida: '2026-02-01' }, { inicioPontuacao: '2026-03-01' }),
    ).toEqual(
      falha(
        'antes-do-inicio-da-pontuacao',
        'saida',
        'A saída do primeiro período não pode ser antes da data de início da pontuação (01/03/2026). Para ir antes, altere primeiro a data de início.',
      ),
    );
  });

  it('saída no próprio dia do início da pontuação é aceita', () => {
    expect(
      avaliar({ tipo: 'corrigir', periodoId: 'p1', saida: '2026-03-01' }, { inicioPontuacao: '2026-03-01' }),
    ).toMatchObject({ ok: true, alterado: true });
  });

  it('só vale para o primeiro período', () => {
    const periodos = [
      p('p1', '2026-01-01', '2026-02-01'),
      p('p2', '2026-02-10', '2026-06-01'),
      p('p3', '2026-07-01', null),
    ];
    expect(
      avaliar({ tipo: 'corrigir', periodoId: 'p2', saida: '2026-02-20' }, { periodos, inicioPontuacao: '2026-03-01' }),
    ).toMatchObject({ ok: true });
  });

  it('inativar o primeiro período antes do início da pontuação também é recusado', () => {
    expect(
      avaliar(
        { tipo: 'inativar', data: '2026-02-01' },
        { periodos: [p('p1', '2026-01-01', null)], inicioPontuacao: '2026-03-01' },
      ),
    ).toMatchObject({ ok: false, regra: 'antes-do-inicio-da-pontuacao' });
  });
});

describe('ordem do GEL-62: com duas falhas, vence a primeira', () => {
  it('data inválida vence campo não corrigível', () => {
    expect(avaliar({ tipo: 'corrigir', periodoId: 'p1', retorno: '2026-02-30' })).toEqual(
      falha('data-invalida', 'retorno', 'Informe uma data válida.'),
    );
  });

  it('campo não corrigível vence data futura', () => {
    expect(avaliar({ tipo: 'corrigir', periodoId: 'p1', retorno: '2027-01-01' })).toEqual(
      falha('nao-corrigivel', 'retorno', MSG_INICIO_PRIMEIRO),
    );
    expect(avaliar({ tipo: 'corrigir', periodoId: 'p2', saida: '2027-01-01' })).toEqual(
      falha('nao-corrigivel', 'saida', MSG_SEM_SAIDA),
    );
  });

  it('data futura vence as regras de ordem', () => {
    const periodos = [p('p1', '2026-01-01', '2026-03-01'), p('p2', '2026-04-01', '2026-06-01')];
    expect(avaliar({ tipo: 'corrigir', periodoId: 'p2', retorno: '2027-01-01' }, { periodos })).toMatchObject({
      regra: 'futuro',
    });
  });

  it('regra de ordem vence a presença', () => {
    expect(
      avaliar({ tipo: 'corrigir', periodoId: 'p1', saida: '2025-12-31' }, { presencas: presente('2026-02-01') }),
    ).toMatchObject({ regra: 'saida-antes-do-inicio' });
  });

  it('presença vence o início da pontuação', () => {
    const r = avaliar(
      { tipo: 'corrigir', periodoId: 'p1', saida: '2026-02-01' },
      { inicioPontuacao: '2026-03-01', presencas: presente('2026-02-15') },
    );
    expect(r).toMatchObject({ regra: 'presenca', campo: 'saida' });
  });
});

describe('presença na correção e na inativação (GEL-58, GEL-68)', () => {
  it('corrigir a saída do primeiro para antes da última presença', () => {
    const r = avaliar(
      { tipo: 'corrigir', periodoId: 'p1', saida: '2026-09-01' },
      { presencas: presente('2026-08-15', '2026-09-10', '2026-12-01') },
    );
    expect(r).toMatchObject({ regra: 'presenca', campo: 'saida' });
    expect(!r.ok && r.mensagem).toContain('Há presença do jogador em 10/09/2026. A saída precisa ser em 11/09/2026');
  });

  it('corrigir o retorno para depois de uma presença', () => {
    const periodos = [p('p1', '2026-01-01', '2026-03-01'), p('p2', '2026-04-01', null)];
    const r = avaliar(
      { tipo: 'corrigir', periodoId: 'p2', retorno: '2026-05-01' },
      { periodos, presencas: presente('2026-04-10', '2026-04-20') },
    );
    expect(r).toMatchObject({ regra: 'presenca', campo: 'retorno' });
    expect(!r.ok && r.mensagem).toContain('O retorno precisa ser em 10/04/2026 ou antes.');
  });

  it('inativar com presença em 01/10 e saída em 30/09 → saída mínima 02/10', () => {
    const r = avaliar(
      { tipo: 'inativar', data: '2026-09-30' },
      { periodos: [p('p1', '2026-01-01', null)], presencas: presente('2026-10-01') },
    );
    expect(r).toEqual(
      falha(
        'presenca',
        'saida',
        'Há presença do jogador em 01/10/2026. A saída precisa ser em 02/10/2026 ou depois. Para usar uma data anterior, remova a presença em Editar partida.',
      ),
    );
  });
});

describe('inativar (GEL-58)', () => {
  const aberto = [p('p1', '2026-01-01', null)];

  it('saída válida fecha o período aberto', () => {
    expect(avaliar({ tipo: 'inativar', data: '2026-10-10' }, { periodos: aberto })).toEqual({
      ok: true,
      alterado: true,
      periodos: [p('p1', '2026-01-01', '2026-10-10')],
    });
  });

  it('fecha o período aberto mesmo quando não é o primeiro', () => {
    expect(avaliar({ tipo: 'inativar', data: '2026-10-21' })).toEqual({
      ok: true,
      alterado: true,
      periodos: [p('p1', '2026-01-01', '2026-10-05'), p('p2', '2026-10-20', '2026-10-21')],
    });
  });

  it('saída antes da entrada, futura e inválida', () => {
    expect(avaliar({ tipo: 'inativar', data: '2025-12-31' }, { periodos: aberto })).toMatchObject({
      regra: 'saida-antes-do-inicio',
      campo: 'saida',
    });
    expect(avaliar({ tipo: 'inativar', data: '2026-10-22' }, { periodos: aberto })).toMatchObject({
      regra: 'futuro',
      campo: 'saida',
    });
    expect(avaliar({ tipo: 'inativar', data: '' }, { periodos: aberto })).toMatchObject({
      regra: 'data-invalida',
      campo: 'saida',
    });
  });

  it('sem período aberto é erro de quem chama (a rota responde 409 antes)', () => {
    expect(() =>
      avaliar({ tipo: 'inativar', data: '2026-10-10' }, { periodos: [p('p1', '2026-01-01', '2026-02-01')] }),
    ).toThrow(RangeError);
  });
});

describe('reativar (GEL-58)', () => {
  const inativo = [p('p1', '2026-01-01', '2026-10-05')];

  it('retorno depois da saída anterior abre um período novo', () => {
    expect(avaliar({ tipo: 'reativar', data: '2026-10-12' }, { periodos: inativo })).toEqual({
      ok: true,
      alterado: true,
      periodos: [p('p1', '2026-01-01', '2026-10-05'), { inicio: '2026-10-12', fim: null }],
    });
  });

  it('retorno no mesmo dia da saída é aceito (GEL-61)', () => {
    expect(avaliar({ tipo: 'reativar', data: '2026-10-05' }, { periodos: inativo })).toMatchObject({ ok: true });
  });

  it('retorno antes da saída anterior, futuro e inválido', () => {
    expect(avaliar({ tipo: 'reativar', data: '2026-10-04' }, { periodos: inativo })).toEqual(
      falha(
        'retorno-antes-da-saida-anterior',
        'retorno',
        'O retorno não pode ser antes da saída anterior (05/10/2026).',
      ),
    );
    expect(avaliar({ tipo: 'reativar', data: '2026-10-22' }, { periodos: inativo })).toMatchObject({ regra: 'futuro' });
    expect(avaliar({ tipo: 'reativar', data: '2026-02-30' }, { periodos: inativo })).toMatchObject({
      regra: 'data-invalida',
    });
  });

  it('presença não bloqueia o retorno (nada sai de período)', () => {
    expect(
      avaliar({ tipo: 'reativar', data: '2026-10-12' }, { periodos: inativo, presencas: presente('2026-10-13') }),
    ).toMatchObject({ ok: true });
  });
});

describe('função pura (GEL-70)', () => {
  it('o mesmo pedido com outro "hoje" muda o resultado: a data vem do parâmetro', () => {
    const periodos = [p('p1', '2026-01-01', null)];
    expect(avaliar({ tipo: 'inativar', data: '2026-10-25' }, { periodos })).toMatchObject({ regra: 'futuro' });
    expect(avaliar({ tipo: 'inativar', data: '2026-10-25' }, { periodos, hoje: '2026-10-25' })).toMatchObject({
      ok: true,
    });
  });

  it('não altera a entrada congelada', () => {
    const periodos = Object.freeze([
      Object.freeze(p('p2', '2026-10-20', null)),
      Object.freeze(p('p1', '2026-01-01', '2026-10-05')),
    ]);
    const copia = JSON.stringify(periodos);
    const r = avaliarPeriodos({
      periodos,
      operacao: { tipo: 'corrigir', periodoId: 'p1', saida: '2026-10-10' },
      hoje: '2026-10-21',
      inicioPontuacao: '2026-01-01',
      presencas: Object.freeze(presente('2026-02-01')),
    });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(periodos)).toBe(copia);
  });
});
