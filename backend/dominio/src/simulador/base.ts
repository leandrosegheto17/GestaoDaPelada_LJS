/**
 * Base do simulador (T2; SIM-01, SIM-51, SIM-95; AD-046, AD-086): tipos, próximo dia de jogo, idade na data e média
 * inteira. Nenhuma função lê relógio nem sorteia (SIM-50): "hoje" e a data chegam por parâmetro. Níveis entram como
 * inteiro × 100 (683 = 6,83), idades em anos e médias × 100, inteiras, com meio para cima (`S:73-79`).
 */
import { somarDias } from '../atividade/datas.ts';
import { diaDaSemana, NUMERO_DO_DIA, type Data, type NomeDiaDaSemana } from '../datas.ts';

export type { Data, NomeDiaDaSemana };

/** "2 times (1º e 2º tempo)" ou "3 ou mais times". */
export type Formato = 'dois_times' | 'varios_times';

/** Limite de substituições por time: 0 a 20, ou sem limite (o contrato valida a faixa). */
export type Limite = number | 'ilimitado';

/** Jogador marcado para a data, como o simulador o recebe. */
export interface Apto {
  id: string;
  apelido: string;
  /** Nível × 100 (550 com `semNota`). */
  nivel: number;
  semNota: boolean;
  /** Nulo em dado antigo (SIM-95). */
  anoNascimento: number | null;
  /** Só vale em 2 times; em 3 ou mais é sempre falso. */
  so1oTempo: boolean;
}

/** Apto com a idade na data da partida já calculada (nula sem ano de nascimento). */
export interface JogadorSim extends Apto {
  idade: number | null;
}

/** Os aptos da entrada, por id. */
export type Elenco = ReadonlyMap<string, JogadorSim>;

/**
 * O próximo dia de jogo a partir de hoje, hoje incluso (AD-086): grupo de quinta, numa terça, é a quinta seguinte; numa
 * quinta, é hoje. Diferente da `dataSugeridaPartida` da partidas-e-ranking, que olha para trás.
 */
export function proximoDiaDeJogo(hoje: Data, dia: NomeDiaDaSemana): Data {
  const faltam = (NUMERO_DO_DIA[dia] - diaDaSemana(hoje) + 7) % 7;
  return somarDias(hoje, faltam);
}

/**
 * Idade na data da partida: ano da data − ano de nascimento (AD-046, legado `elenco/idade.ts:4`), a mesma em qualquer
 * dia do ano, para a mesma entrada dar a mesma resposta. Sem ano, nula (SIM-95).
 */
export function idadeNaData(anoNascimento: number | null, data: Data): number | null {
  if (anoNascimento === null) return null;
  return Number(data.slice(0, 4)) - anoNascimento;
}

/**
 * Média inteira com meio para cima, só com inteiros (SIM-51): `floor((2 × soma + q) / 2q)` é `round(soma / q)` sem
 * ponto flutuante. Quem chama passa a soma já × 100 (níveis já são × 100; idades, `100 × soma`). Nula com 0.
 */
export function mediaInteira(soma: number, quantidade: number): number | null {
  if (quantidade === 0) return null;
  return Math.floor((2 * soma + quantidade) / (2 * quantidade));
}

/** Aptos da entrada com a idade na data, por id (a ordem do mapa é a da entrada; quem precisa de ordem ordena). */
export function montarElenco(aptos: readonly Apto[], data: Data): Elenco {
  return new Map(aptos.map((a) => [a.id, { ...a, idade: idadeNaData(a.anoNascimento, data) }]));
}

/** Busca o jogador no elenco; id fora dos aptos é erro de programação (o contrato e o `avaliar` recusam antes). */
export function jogadorDe(elenco: Elenco, id: string): JogadorSim {
  const j = elenco.get(id);
  if (!j) throw new Error(`jogador fora dos aptos: ${id}`);
  return j;
}

/** Ordem de texto estável para desempate por id. */
export function compararIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
