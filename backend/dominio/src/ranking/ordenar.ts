/**
 * Ordem e posição do ranking (T9; PAR-68, PAR-69).
 */
import { chaveBusca, compararApelido } from '../elenco/apelido.ts';

/** Ano usado no desempate de quem não tem ano de nascimento: vai para o fim (`B:66`, legado). */
export const ANO_SEM_INFORMACAO = 9999;

export interface Rankeavel {
  id: string;
  apelido: string;
  /** Nulo em dado antigo: desempata como `ANO_SEM_INFORMACAO`. */
  anoNascimento: number | null;
}

export interface Colocado<T extends Rankeavel> {
  jogador: T;
  acumulado: number;
  /** Empatados nos três critérios repetem o número e o seguinte pula (1, 1, 3). */
  posicao: number;
}

const ano = (j: Rankeavel): number => j.anoNascimento ?? ANO_SEM_INFORMACAO;

const porChave = (a: string, b: string): number => {
  const ca = chaveBusca(a);
  const cb = chaveBusca(b);
  return ca < cb ? -1 : ca > cb ? 1 : 0;
};

/**
 * Ordena pelo acumulado até hoje (maior primeiro), pelo ano de nascimento (menor primeiro, sem ano no fim) e pelo
 * apelido sem acento nem caixa (PAR-68). Empatados nos três têm a mesma posição e a seguinte pula os empatados
 * (PAR-69); entre eles, o apelido original e o id só fixam a ordem de exibição, sem mudar a posição.
 */
export function ordenarPorRanking<T extends Rankeavel>(
  jogadores: readonly T[],
  acumulados: ReadonlyMap<string, number>,
): Colocado<T>[] {
  const itens = jogadores.map((jogador) => ({
    jogador,
    acumulado: acumulados.get(jogador.id) ?? 0,
  }));
  type Item = (typeof itens)[number];
  const criterios = (a: Item, b: Item): number =>
    b.acumulado - a.acumulado ||
    ano(a.jogador) - ano(b.jogador) ||
    porChave(a.jogador.apelido, b.jogador.apelido);
  const estavel = (a: Item, b: Item): number =>
    compararApelido(a.jogador.apelido, b.jogador.apelido) ||
    (a.jogador.id < b.jogador.id ? -1 : a.jogador.id > b.jogador.id ? 1 : 0);
  itens.sort((a, b) => criterios(a, b) || estavel(a, b));

  const colocados: Colocado<T>[] = [];
  itens.forEach((item, indice) => {
    const anterior = itens[indice - 1];
    const empata = anterior !== undefined && criterios(anterior, item) === 0;
    const posicao = empata ? (colocados[indice - 1] as Colocado<T>).posicao : indice + 1;
    colocados.push({ ...item, posicao });
  });
  return colocados;
}
