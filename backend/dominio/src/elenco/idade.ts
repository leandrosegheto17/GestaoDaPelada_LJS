import { exigirData, type Data } from '../datas.ts';

/** Idade mínima para entrar no elenco, em anos de calendário. */
const IDADE_MINIMA = 10;

/** Maior ano de nascimento aceito no cadastro: ano de hoje − 10 (GEL-36). `hoje` vem de fora, em São Paulo. */
export function anoNascimentoMaximo(hoje: Data): number {
  return Number(exigirData(hoje).slice(0, 4)) - IDADE_MINIMA;
}
