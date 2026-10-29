// Critério: GEL-68 (presença que sai de dentro de um período bloqueia; data mínima da saída é o dia seguinte à última
// presença retirada; data máxima do retorno é o dia da primeira; presença já fora de período não bloqueia; conta só
// presente, lesionado e expulso). Parte dos casos vem do legado (`test/atividade/cobertura-periodos.test.ts`).
import { describe, expect, it } from 'vitest';
import {
  coberturaRetirada,
  validarPresencas,
  type Periodo,
  type PresencaJogador,
  type SituacaoPresenca,
} from '../../src/index.ts';

const p = (inicio: string, fim: string | null): Periodo => ({ inicio, fim });
const presente = (...datas: string[]): PresencaJogador[] => datas.map((data) => ({ data, situacao: 'presente' }));

describe('coberturaRetirada (GEL-68)', () => {
  it('presença em 01/10 e saída em 30/09: retira 01/10 e a data mínima é 02/10', () => {
    const r = coberturaRetirada({
      antes: [p('2026-09-01', null)],
      depois: [p('2026-09-01', '2026-09-30')],
      presencas: presente('2026-10-01'),
    });
    expect(r).toEqual({ retiradas: ['2026-10-01'], limiteSaida: '2026-10-02', limiteRetorno: '2026-10-01' });
  });

  it('adiar o retorno para depois de uma presença: a data máxima é o dia dela', () => {
    const r = coberturaRetirada({
      antes: [p('2026-10-12', null)],
      depois: [p('2026-10-20', null)],
      presencas: presente('2026-10-15', '2026-10-13'),
    });
    expect(r.retiradas).toEqual(['2026-10-13', '2026-10-15']);
    expect(r.limiteRetorno).toBe('2026-10-13');
  });

  it('antecipar a saída com várias presenças: mínimo é o dia seguinte à mais tarde', () => {
    const r = coberturaRetirada({
      antes: [p('2026-09-01', '2026-10-05')],
      depois: [p('2026-09-01', '2026-10-01')],
      presencas: presente('2026-10-03', '2026-10-02'),
    });
    expect(r.retiradas).toEqual(['2026-10-02', '2026-10-03']);
    expect(r.limiteSaida).toBe('2026-10-04');
  });

  it('presença que já estava fora de período não bloqueia', () => {
    const r = coberturaRetirada({
      antes: [p('2026-10-10', null)],
      depois: [p('2026-10-12', null)],
      presencas: presente('2026-09-01'),
    });
    expect(r).toEqual({ retiradas: [], limiteSaida: null, limiteRetorno: null });
  });

  it('presença que continua dentro não bloqueia (adiar saída, antecipar retorno)', () => {
    expect(
      coberturaRetirada({
        antes: [p('2026-09-01', '2026-10-01')],
        depois: [p('2026-09-01', '2026-10-05')],
        presencas: presente('2026-09-20', '2026-10-02'),
      }).retiradas,
    ).toEqual([]);
    expect(
      coberturaRetirada({
        antes: [p('2026-10-20', null)],
        depois: [p('2026-10-12', null)],
        presencas: presente('2026-10-20'),
      }).retiradas,
    ).toEqual([]);
  });

  it.each<[SituacaoPresenca, boolean]>([
    ['presente', true],
    ['lesionado', true],
    ['expulso', true],
    ['ausente', false],
  ])('situação %s conta? %s', (situacao, conta) => {
    const r = coberturaRetirada({
      antes: [p('2026-09-01', null)],
      depois: [p('2026-09-01', '2026-09-30')],
      presencas: [{ data: '2026-10-01', situacao }],
    });
    expect(r.retiradas).toEqual(conta ? ['2026-10-01'] : []);
  });

  it('bordas: início inclusivo, fim exclusivo; o dia da saída nova já fica fora', () => {
    const r = coberturaRetirada({
      antes: [p('2026-10-01', '2026-10-20')],
      depois: [p('2026-10-10', '2026-10-15')],
      presencas: presente('2026-10-10', '2026-10-15'),
    });
    expect(r.retiradas).toEqual(['2026-10-15']);
  });

  it('datas repetidas aparecem uma vez e a entrada não é alterada', () => {
    const presencas = Object.freeze(presente('2026-10-05', '2026-10-03', '2026-10-05'));
    const copia = JSON.stringify(presencas);
    const r = coberturaRetirada({ antes: [p('2026-10-01', null)], depois: [p('2026-10-10', null)], presencas });
    expect(r.retiradas).toEqual(['2026-10-03', '2026-10-05']);
    expect(JSON.stringify(presencas)).toBe(copia);
  });
});

describe('validarPresencas: mensagem do GEL-68', () => {
  it('saída: "Há presença do jogador em 01/10/2026. A saída precisa ser em 02/10/2026 ou depois. …"', () => {
    const r = validarPresencas({
      antes: [p('2026-09-01', null)],
      depois: [p('2026-09-01', '2026-09-30')],
      inicioDoAlvo: '2026-09-01',
      saidaInformada: true,
      presencas: presente('2026-10-01'),
    });
    expect(r).toEqual({
      ok: false,
      regra: 'presenca',
      campo: 'saida',
      mensagem:
        'Há presença do jogador em 01/10/2026. A saída precisa ser em 02/10/2026 ou depois. Para usar uma data anterior, remova a presença em Editar partida.',
    });
  });

  it('retorno: "Há presença do jogador em 13/10/2026. O retorno precisa ser em 13/10/2026 ou antes. …"', () => {
    const r = validarPresencas({
      antes: [p('2026-01-01', '2026-03-01'), p('2026-10-12', null)],
      depois: [p('2026-01-01', '2026-03-01'), p('2026-10-20', null)],
      inicioDoAlvo: '2026-10-20',
      saidaInformada: false,
      presencas: presente('2026-10-13', '2026-10-15'),
    });
    expect(r).toEqual({
      ok: false,
      regra: 'presenca',
      campo: 'retorno',
      mensagem:
        'Há presença do jogador em 13/10/2026. O retorno precisa ser em 13/10/2026 ou antes. Para usar uma data posterior, remova a presença em Editar partida.',
    });
  });

  it('saída e retorno informados, presença retirada dos dois lados: a saída vem primeiro', () => {
    const r = validarPresencas({
      antes: [p('2026-01-01', '2026-03-01'), p('2026-04-01', '2026-06-01')],
      depois: [p('2026-01-01', '2026-03-01'), p('2026-04-10', '2026-05-01')],
      inicioDoAlvo: '2026-04-10',
      saidaInformada: true,
      presencas: presente('2026-04-05', '2026-05-20'),
    });
    expect(r).toMatchObject({ campo: 'saida' });
    expect(r?.mensagem).toContain('Há presença do jogador em 20/05/2026. A saída precisa ser em 21/05/2026 ou depois.');
  });

  it('sem presença retirada: nenhuma falha', () => {
    expect(
      validarPresencas({
        antes: [p('2026-09-01', null)],
        depois: [p('2026-09-01', '2026-10-05')],
        inicioDoAlvo: '2026-09-01',
        saidaInformada: true,
        presencas: [...presente('2026-08-01'), { data: '2026-10-10', situacao: 'ausente' }],
      }),
    ).toBeNull();
  });
});
