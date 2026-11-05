/**
 * Data sugerida para lançar a partida (T7; PAR-17). É só sugestão: a partida pode ser lançada em outro dia (`B:502`).
 */
import { somarDias, type Data } from '../atividade/datas.ts';
import { diaDaSemana, ehDataReal, NUMERO_DO_DIA, type NomeDiaDaSemana } from '../datas.ts';

/** A maior data até `hoje` (inclusive) que cai no dia da semana do grupo: hoje, se hoje é o dia. */
export function dataSugeridaPartida(hoje: Data, dia: NomeDiaDaSemana): Data {
  if (!ehDataReal(hoje))
    throw new RangeError(`Hoje inválido: ${JSON.stringify(hoje)}. Use AAAA-MM-DD.`);
  const volta = (diaDaSemana(hoje) - NUMERO_DO_DIA[dia] + 7) % 7;
  return somarDias(hoje, -volta);
}
