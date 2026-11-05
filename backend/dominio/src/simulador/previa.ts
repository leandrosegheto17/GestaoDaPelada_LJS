/**
 * Prévia do simulador (T3; SIM-09 a SIM-13): quantos times saem com os aptos marcados, e por que não saem. Só conta;
 * não lê histórico nem grava (SIM-09). Dois times pedem aptos ≥ 2N; três ou mais pedem aptos > 2N. Regra do legado
 * `dominio/src/simulador/previa.ts`, escrita do zero; a prévia carrega `n` e `aptos` para a descrição (T4) não precisar
 * de outra entrada.
 */
import type { Formato } from './base.ts';

/** Menor N aceito (o contrato vai de 2 a 11). */
export const N_MINIMO = 2;

export interface EntradaPrevia {
  formato: Formato;
  /** Jogadores por time, já validado pelo contrato (2 a 11). */
  n: number;
  /** Quantidade de aptos marcados. */
  aptos: number;
}

export interface TimesVarios {
  /** Total de times, contando o incompleto. */
  times: number;
  timesCompletos: number;
  /** Tamanho do incompleto; 0 = não há incompleto. */
  tamanhoIncompleto: number;
}

export type Previa =
  | { formato: 'dois_times'; valida: true; n: number; aptos: number; reservas: number }
  | {
      formato: 'dois_times';
      valida: false;
      n: number;
      aptos: number;
      maiorNPossivel: number | null;
    }
  | ({ formato: 'varios_times'; valida: true; n: number; aptos: number } & TimesVarios)
  | {
      formato: 'varios_times';
      valida: false;
      n: number;
      aptos: number;
      /** (aptos − 1) ÷ 2 para baixo, o maior N que ainda forma 3 times; nulo se menor que 2. */
      nSugerido: number | null;
      /** Aptos para 2 times de 2: o formato "2 times" é uma saída. */
      doisTimesPossivel: boolean;
    };

/** T = teto(aptos ÷ N): `timesCompletos` de N e, se sobrar R = aptos mod N, um incompleto de R. Só inteiros. */
export function timesVarios(aptos: number, n: number): TimesVarios {
  const timesCompletos = Math.floor(aptos / n);
  const tamanhoIncompleto = aptos % n;
  return {
    times: timesCompletos + (tamanhoIncompleto > 0 ? 1 : 0),
    timesCompletos,
    tamanhoIncompleto,
  };
}

/** A prévia da entrada (SIM-10 a SIM-13). */
export function calcularPrevia({ formato, n, aptos }: EntradaPrevia): Previa {
  if (formato === 'dois_times') {
    if (aptos >= 2 * n) return { formato, valida: true, n, aptos, reservas: aptos - 2 * n };
    const maior = Math.floor(aptos / 2);
    return { formato, valida: false, n, aptos, maiorNPossivel: maior >= N_MINIMO ? maior : null };
  }
  if (aptos > 2 * n) return { formato, valida: true, n, aptos, ...timesVarios(aptos, n) };
  const sugerido = Math.floor((aptos - 1) / 2);
  return {
    formato,
    valida: false,
    n,
    aptos,
    nSugerido: sugerido >= N_MINIMO ? sugerido : null,
    doisTimesPossivel: aptos >= 2 * N_MINIMO,
  };
}
