import { describe, expect, it } from 'vitest';
import { ordenarPorRanking, type Rankeavel } from '../../src/ranking/ordenar.ts';

/**
 * Ordem e posição do ranking (T9; PAR-68, PAR-69).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - "José", "Jose" e "Jôse" empatados em pontos e ano: mesma posição, o seguinte é o 4 (`B:492`);
 * - sem ano de nascimento vai depois de todos com ano, no mesmo acumulado (`B:66`);
 * - acumulado maior primeiro, mesmo negativo; ano menor primeiro;
 * - apelido com caixa e acento diferentes ordena pela chave sem acento nem caixa;
 * - jogador sem acumulado no mapa conta 0;
 * - empate em pontos mas não em ano: posições diferentes.
 */

const j = (id: string, apelido: string, anoNascimento: number | null = 1990): Rankeavel => ({ id, apelido, anoNascimento });
const posicoes = (r: ReturnType<typeof ordenarPorRanking>) => r.map((c) => [c.jogador.apelido, c.posicao]);

describe('ordenarPorRanking', () => {
  it('PAR-69: "José", "Jose" e "Jôse" empatados em tudo ficam na mesma posição e o seguinte é o 4', () => {
    const jogadores = [j('1', 'José'), j('2', 'Jose'), j('3', 'Jôse'), j('4', 'Ana')];
    const acumulados = new Map([
      ['1', 10],
      ['2', 10],
      ['3', 10],
      ['4', 5],
    ]);
    const r = ordenarPorRanking(jogadores, acumulados);
    expect(r.slice(0, 3).map((c) => c.posicao)).toEqual([1, 1, 1]);
    expect(r[3]).toMatchObject({ posicao: 4, jogador: { apelido: 'Ana' } });
  });

  it('PAR-69: empate só em pontos não repete a posição (1, 1, 3 só com três critérios iguais)', () => {
    const jogadores = [j('1', 'Beto', 1990), j('2', 'Beto', 1990), j('3', 'Caio', 1991)];
    const r = ordenarPorRanking(jogadores, new Map([['1', 7], ['2', 7], ['3', 7]]));
    expect(r.map((c) => c.posicao)).toEqual([1, 1, 3]);
  });

  it('PAR-68: sem ano de nascimento vai depois de todos com ano, no mesmo acumulado', () => {
    const jogadores = [j('1', 'Aldo', null), j('2', 'Zeca', 2005), j('3', 'Bia', 1980)];
    const r = ordenarPorRanking(jogadores, new Map([['1', 3], ['2', 3], ['3', 3]]));
    expect(posicoes(r)).toEqual([
      ['Bia', 1],
      ['Zeca', 2],
      ['Aldo', 3],
    ]);
  });

  it('PAR-68: acumulado maior primeiro, inclusive negativo, e sem acumulado conta 0', () => {
    const jogadores = [j('1', 'Ana'), j('2', 'Bia'), j('3', 'Cris')];
    const r = ordenarPorRanking(jogadores, new Map([['1', -2], ['3', 4]]));
    expect(posicoes(r)).toEqual([
      ['Cris', 1],
      ['Bia', 2],
      ['Ana', 3],
    ]);
  });

  it('PAR-68: apelido sem acento nem caixa no terceiro critério', () => {
    const jogadores = [j('1', 'édson'), j('2', 'Duda'), j('3', 'fábio')];
    const r = ordenarPorRanking(jogadores, new Map());
    expect(r.map((c) => c.jogador.apelido)).toEqual(['Duda', 'édson', 'fábio']);
  });
});
