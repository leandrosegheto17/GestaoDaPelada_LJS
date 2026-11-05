import { describe, expect, it } from 'vitest';
import { coberturaRetirada, falhaPresenca, type PresencaJogador } from '../../src/atividade/cobertura.ts';

/**
 * Presença que sai do período (T13; GEL-68).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Presença no dia da saída: fica fora de [início, fim), então é retirada se antes estava dentro.
 * - Presença na véspera da saída: continua dentro.
 * - Várias presenças retiradas: a mensagem de saída usa a última (mínimo = dia seguinte a ela).
 * - Presença que já estava fora de período antes da mudança: não bloqueia.
 * - Retorno adiado para depois de uma presença: a mensagem de retorno usa a primeira retirada como máximo.
 * - Ausência nunca bloqueia; lesionado e expulso bloqueiam como presente.
 */

const presente = (data: string): PresencaJogador => ({ data, situacao: 'presente' });

describe('GEL-68: pela saída', () => {
  const antes = [{ inicio: '2026-09-01', fim: null }];

  it('GEL-68: presença em 01/10 e saída em 30/09 dá a mensagem com 01/10 e a data mínima 02/10', () => {
    const depois = [{ inicio: '2026-09-01', fim: '2026-09-30' }];
    const retiradas = coberturaRetirada(antes, depois, [presente('2026-10-01')]);
    expect(retiradas).toEqual([{ data: '2026-10-01', por: 'saida' }]);
    expect(falhaPresenca(retiradas)).toEqual({
      ok: false,
      regra: 'presenca',
      mensagem:
        'Há presença do jogador em 01/10/2026. A saída precisa ser em 02/10/2026 ou depois. Para usar uma data anterior, remova a presença em Editar partida.',
      campo: 'saida',
    });
  });

  it('GEL-68: presença no dia da saída é retirada', () => {
    const depois = [{ inicio: '2026-09-01', fim: '2026-10-01' }];
    expect(coberturaRetirada(antes, depois, [presente('2026-10-01')])).toEqual([{ data: '2026-10-01', por: 'saida' }]);
  });

  it('GEL-68: presença na véspera da saída fica dentro e não bloqueia', () => {
    const depois = [{ inicio: '2026-09-01', fim: '2026-10-02' }];
    const retiradas = coberturaRetirada(antes, depois, [presente('2026-10-01')]);
    expect(retiradas).toEqual([]);
    expect(falhaPresenca(retiradas)).toBeNull();
  });

  it('GEL-68: várias presenças retiradas, a mensagem usa a última', () => {
    const depois = [{ inicio: '2026-09-01', fim: '2026-09-20' }];
    const retiradas = coberturaRetirada(antes, depois, [presente('2026-10-08'), presente('2026-09-25'), presente('2026-10-01')]);
    expect(retiradas.map((r) => r.data)).toEqual(['2026-09-25', '2026-10-01', '2026-10-08']);
    expect(falhaPresenca(retiradas)?.mensagem).toBe(
      'Há presença do jogador em 08/10/2026. A saída precisa ser em 09/10/2026 ou depois. Para usar uma data anterior, remova a presença em Editar partida.',
    );
  });

  it.each(['lesionado', 'expulso'] as const)('GEL-68: %s bloqueia como presente', (situacao) => {
    const depois = [{ inicio: '2026-09-01', fim: '2026-09-30' }];
    expect(coberturaRetirada(antes, depois, [{ data: '2026-10-01', situacao }])).toHaveLength(1);
  });

  it('GEL-68: ausência não bloqueia', () => {
    const depois = [{ inicio: '2026-09-01', fim: '2026-09-30' }];
    expect(coberturaRetirada(antes, depois, [{ data: '2026-10-01', situacao: 'ausente' }])).toEqual([]);
  });
});

describe('GEL-68: presença que já estava fora', () => {
  it('GEL-68: presença que já estava fora de período não bloqueia', () => {
    // Saiu em 01/06, voltou em 10/06; a presença de 05/06 já estava fora. Corrigir a saída para 02/06 não a retira.
    const antes = [
      { inicio: '2026-03-01', fim: '2026-06-01' },
      { inicio: '2026-06-10', fim: null },
    ];
    const depois = [
      { inicio: '2026-03-01', fim: '2026-06-02' },
      { inicio: '2026-06-10', fim: null },
    ];
    const retiradas = coberturaRetirada(antes, depois, [presente('2026-06-05')]);
    expect(retiradas).toEqual([]);
    expect(falhaPresenca(retiradas)).toBeNull();
  });
});

describe('GEL-68: pelo retorno', () => {
  it('GEL-68: retorno adiado para depois de uma presença dá a mensagem de retorno com a data máxima', () => {
    const antes = [
      { inicio: '2026-03-01', fim: '2026-06-01' },
      { inicio: '2026-06-10', fim: null },
    ];
    const depois = [
      { inicio: '2026-03-01', fim: '2026-06-01' },
      { inicio: '2026-06-20', fim: null },
    ];
    const retiradas = coberturaRetirada(antes, depois, [presente('2026-06-17'), presente('2026-06-12')]);
    expect(retiradas).toEqual([
      { data: '2026-06-12', por: 'retorno' },
      { data: '2026-06-17', por: 'retorno' },
    ]);
    expect(falhaPresenca(retiradas)).toEqual({
      ok: false,
      regra: 'presenca',
      mensagem:
        'Há presença do jogador em 12/06/2026. O retorno precisa ser em 12/06/2026 ou antes. Para usar uma data posterior, remova a presença em Editar partida.',
      campo: 'retorno',
    });
  });

  it('GEL-68: retorno no dia da presença a mantém dentro', () => {
    const antes = [{ inicio: '2026-06-10', fim: null }];
    const depois = [{ inicio: '2026-06-12', fim: null }];
    expect(coberturaRetirada(antes, depois, [presente('2026-06-12')])).toEqual([]);
  });
});
