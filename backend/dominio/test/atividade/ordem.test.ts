import { describe, expect, it } from 'vitest';
import type { Periodo } from '../../src/atividade/datas.ts';
import {
  MENSAGEM_SOBREPOSICAO,
  verificarOrdem,
  verificarSobreposicao,
} from '../../src/atividade/ordem.ts';

/**
 * Ordem e sobreposição (T12; GEL-65, GEL-66, GEL-67).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Cada regra no dia exato (vale), na véspera e no dia seguinte (um dos dois falha, conforme a regra).
 * - Três períodos com o do meio alterado: a saída do meio contra o retorno do terceiro; o retorno do meio contra a
 *   saída do primeiro.
 * - Período aberto: corrigir a saída não se aplica aqui (é "nao-corrigivel", T14); a regra de ordem da saída ignora.
 * - Sem vizinho (primeiro ou último período): a regra do vizinho não se aplica.
 */

/** Três períodos: [01/03, 01/06), [10/06, 01/09), [10/09, aberto). */
function tres(meio: Periodo): Periodo[] {
  return [{ inicio: '2026-03-01', fim: '2026-06-01' }, meio, { inicio: '2026-09-10', fim: null }];
}

describe('GEL-65: saída antes do início do próprio período', () => {
  it('GEL-65: na véspera do início falha, com a data do início', () => {
    expect(verificarOrdem(tres({ inicio: '2026-06-10', fim: '2026-06-09' }), 1, 'saida')).toEqual({
      ok: false,
      regra: 'saida-antes-do-inicio',
      mensagem: 'A saída não pode ser antes do início deste período (10/06/2026).',
      campo: 'saida',
    });
  });

  it('GEL-65: no dia exato do início vale', () => {
    expect(
      verificarOrdem(tres({ inicio: '2026-06-10', fim: '2026-06-10' }), 1, 'saida'),
    ).toBeNull();
  });

  it('GEL-65: no dia seguinte ao início vale', () => {
    expect(
      verificarOrdem(tres({ inicio: '2026-06-10', fim: '2026-06-11' }), 1, 'saida'),
    ).toBeNull();
  });
});

describe('GEL-66: saída depois do próximo retorno', () => {
  it('GEL-66: um dia depois do próximo retorno falha, com a data do retorno seguinte', () => {
    expect(verificarOrdem(tres({ inicio: '2026-06-10', fim: '2026-09-11' }), 1, 'saida')).toEqual({
      ok: false,
      regra: 'saida-depois-do-proximo-retorno',
      mensagem: 'A saída não pode ser depois do próximo retorno (10/09/2026).',
      campo: 'saida',
    });
  });

  it('GEL-66: no dia exato do próximo retorno vale (sair e voltar no mesmo dia)', () => {
    expect(
      verificarOrdem(tres({ inicio: '2026-06-10', fim: '2026-09-10' }), 1, 'saida'),
    ).toBeNull();
  });

  it('GEL-66: na véspera do próximo retorno vale', () => {
    expect(
      verificarOrdem(tres({ inicio: '2026-06-10', fim: '2026-09-09' }), 1, 'saida'),
    ).toBeNull();
  });

  it('GEL-66: último período encerrado, sem retorno seguinte, não tem essa regra', () => {
    const periodos = [{ inicio: '2026-03-01', fim: '2026-12-01' }];
    expect(verificarOrdem(periodos, 0, 'saida')).toBeNull();
  });
});

describe('GEL-66: retorno antes da saída anterior', () => {
  it('GEL-66: na véspera da saída anterior falha, com a data da saída anterior', () => {
    expect(verificarOrdem(tres({ inicio: '2026-05-31', fim: '2026-09-01' }), 1, 'retorno')).toEqual(
      {
        ok: false,
        regra: 'retorno-antes-da-saida-anterior',
        mensagem: 'O retorno não pode ser antes da saída anterior (01/06/2026).',
        campo: 'retorno',
      },
    );
  });

  it('GEL-66: no dia exato da saída anterior vale', () => {
    expect(
      verificarOrdem(tres({ inicio: '2026-06-01', fim: '2026-09-01' }), 1, 'retorno'),
    ).toBeNull();
  });

  it('GEL-66: no dia seguinte à saída anterior vale', () => {
    expect(
      verificarOrdem(tres({ inicio: '2026-06-02', fim: '2026-09-01' }), 1, 'retorno'),
    ).toBeNull();
  });
});

describe('GEL-66: retorno depois da saída do próprio período', () => {
  it('GEL-66: um dia depois da saída do próprio período falha, com a data da saída', () => {
    expect(verificarOrdem(tres({ inicio: '2026-09-02', fim: '2026-09-01' }), 1, 'retorno')).toEqual(
      {
        ok: false,
        regra: 'retorno-depois-da-saida',
        mensagem: 'O retorno não pode ser depois da saída deste período (01/09/2026).',
        campo: 'retorno',
      },
    );
  });

  it('GEL-66: no dia exato da saída do próprio período vale', () => {
    expect(
      verificarOrdem(tres({ inicio: '2026-09-01', fim: '2026-09-01' }), 1, 'retorno'),
    ).toBeNull();
  });

  it('GEL-66: retorno de período aberto não tem saída própria', () => {
    const periodos = [
      { inicio: '2026-03-01', fim: '2026-06-01' },
      { inicio: '2026-06-15', fim: null },
    ];
    expect(verificarOrdem(periodos, 1, 'retorno')).toBeNull();
  });
});

describe('GEL-67: sobreposição', () => {
  it('GEL-67: resultado com dois períodos sobrepostos dá "Os períodos não podem se sobrepor."', () => {
    const periodos = [
      { inicio: '2026-03-01', fim: '2026-06-15' },
      { inicio: '2026-06-10', fim: null },
    ];
    expect(verificarSobreposicao(periodos, 'saida')).toEqual({
      ok: false,
      regra: 'sobreposicao',
      mensagem: 'Os períodos não podem se sobrepor.',
      campo: 'saida',
    });
    expect(MENSAGEM_SOBREPOSICAO).toBe('Os períodos não podem se sobrepor.');
  });

  it('GEL-67: sobreposição entre o primeiro e o terceiro também é pega', () => {
    const periodos = [
      { inicio: '2026-03-01', fim: '2026-12-01' },
      { inicio: '2026-12-01', fim: '2026-12-02' },
      { inicio: '2026-11-01', fim: null },
    ];
    expect(verificarSobreposicao(periodos, 'retorno')?.regra).toBe('sobreposicao');
  });

  it('GEL-67, GEL-61: períodos encostados (saída = retorno seguinte) não se sobrepõem', () => {
    expect(
      verificarSobreposicao(tres({ inicio: '2026-06-01', fim: '2026-09-10' }), 'saida'),
    ).toBeNull();
  });
});
