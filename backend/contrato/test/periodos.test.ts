// Critérios: GEL-52 e GEL-55 (data omitida = hoje, decidido na rota), GEL-71 (corrigir saída e/ou retorno), GEL-74
// (resposta com `alterado`) e GEL-77 (alterar o início pede a data). A validade da data é do domínio (GEL-63).
import { describe, expect, it } from 'vitest';
import { corrigirPeriodoCorpo, corrigirPeriodoResposta, dataCorpo, inicioCorpo } from '../src/periodos.ts';
import { camposDe } from './apoio.ts';

describe('dataCorpo: inativar e reativar (GEL-52, GEL-55)', () => {
  it('aceita corpo sem data (a rota usa hoje) e com data', () => {
    expect(dataCorpo.parse({})).toEqual({});
    expect(dataCorpo.parse({ data: '2026-10-05' })).toEqual({ data: '2026-10-05' });
  });

  it('recusa campo extra', () => {
    expect(dataCorpo.safeParse({ data: '2026-10-05', dataSaida: '2026-10-05' }).success).toBe(false);
  });

  it('fora do texto AAAA-MM-DD é recusado no campo data; a data impossível passa para o domínio', () => {
    expect(camposDe(dataCorpo, { data: '05/10/2026' })).toEqual({ data: 'Informe uma data válida.' });
    expect(camposDe(dataCorpo, { data: 20261005 })).toEqual({ data: 'Informe uma data válida.' });
    expect(dataCorpo.safeParse({ data: '2026-02-30' }).success).toBe(true);
  });
});

describe('corrigirPeriodoCorpo (GEL-71)', () => {
  it('aceita só a saída, só o retorno ou os dois', () => {
    expect(corrigirPeriodoCorpo.parse({ saida: '2026-10-03' })).toEqual({ saida: '2026-10-03' });
    expect(corrigirPeriodoCorpo.parse({ retorno: '2026-10-12' })).toEqual({ retorno: '2026-10-12' });
    expect(corrigirPeriodoCorpo.parse({ saida: '2026-10-03', retorno: '2026-09-01' })).toEqual({
      saida: '2026-10-03',
      retorno: '2026-09-01',
    });
  });

  it('recusa corpo sem nenhuma das duas datas', () => {
    expect(camposDe(corrigirPeriodoCorpo, {})).toEqual({ corpo: 'Informe a saída ou o retorno.' });
  });

  it('recusa campo extra e data fora do formato no campo certo', () => {
    expect(corrigirPeriodoCorpo.safeParse({ saida: '2026-10-03', inicio: '2026-01-01' }).success).toBe(false);
    expect(camposDe(corrigirPeriodoCorpo, { retorno: 'ontem' })).toEqual({ retorno: 'Informe uma data válida.' });
  });
});

describe('inicioCorpo (GEL-77)', () => {
  it('exige data', () => {
    expect(inicioCorpo.parse({ data: '2026-02-01' })).toEqual({ data: '2026-02-01' });
    expect(camposDe(inicioCorpo, {})).toEqual({ data: 'Informe uma data válida.' });
    expect(inicioCorpo.safeParse({ data: '2026-02-01', recuar: true }).success).toBe(false);
  });
});

describe('corrigirPeriodoResposta (GEL-74)', () => {
  it('traz alterado e os períodos; a mensagem é opcional', () => {
    const periodos = [{ id: 'p1', inicio: '2026-02-05', fim: '2026-10-03' }];
    expect(corrigirPeriodoResposta.parse({ alterado: true, periodos })).toEqual({ alterado: true, periodos });
    expect(corrigirPeriodoResposta.parse({ alterado: false, mensagem: 'Nada a alterar.', periodos })).toMatchObject({
      alterado: false,
      mensagem: 'Nada a alterar.',
    });
    expect(corrigirPeriodoResposta.safeParse({ periodos }).success).toBe(false);
  });
});
