/**
 * Configuração de pesos vigente numa data (T3; PAR-56).
 */
import type { Data } from '../atividade/datas.ts';
import { compararDatas } from '../datas.ts';
import type { ConfigPesos } from './pesos.ts';

/** Devolve a configuração vigente na data. */
export type ResolvedorDePesos = (data: Data) => ConfigPesos;

export const MENSAGEM_SEM_PESOS = 'O grupo precisa de ao menos uma configuração de pesos.';

/**
 * Ordena as configurações uma vez e resolve cada data por busca binária: a de maior `vigenteDesde` igual ou anterior à
 * data (no dia exato vale a nova); uma data anterior à primeira configuração usa a mais antiga. O banco garante uma
 * configuração por dia (`UNIQUE (grupo_id, vigente_desde)`), então não há empate. Sem configuração, lança.
 */
export function criarResolvedorDePesos(configs: readonly ConfigPesos[]): ResolvedorDePesos {
  if (configs.length === 0) throw new Error(MENSAGEM_SEM_PESOS);
  const ordenadas = [...configs].sort((a, b) => compararDatas(a.vigenteDesde, b.vigenteDesde));
  return (data) => {
    let baixo = 0;
    let alto = ordenadas.length - 1;
    let achada = 0;
    while (baixo <= alto) {
      const meio = (baixo + alto) >> 1;
      if (compararDatas((ordenadas[meio] as ConfigPesos).vigenteDesde, data) <= 0) {
        achada = meio;
        baixo = meio + 1;
      } else {
        alto = meio - 1;
      }
    }
    return ordenadas[achada] as ConfigPesos;
  };
}
