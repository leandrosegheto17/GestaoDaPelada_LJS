/**
 * Pesos de pontuação (T2; PAR-55, PAR-135, PAR-13). Cada situação gravada tem um peso para partida sem chuva e outro
 * para partida com chuva. `ausente` não grava linha de presença (PAR-23) e não tem peso.
 */
import type { SituacaoPresenca } from '../atividade/cobertura.ts';
import type { Data } from '../atividade/datas.ts';

/** Situação de uma presença gravada. */
export type SituacaoGravada = Exclude<SituacaoPresenca, 'ausente'>;

/** Os seis pesos (RN-01). */
export interface Pesos {
  presencaSemChuva: number;
  presencaComChuva: number;
  lesionadoSemChuva: number;
  lesionadoComChuva: number;
  expulsoSemChuva: number;
  expulsoComChuva: number;
}

/** Configuração de pesos com a data em que passa a valer (uma por dia por grupo, PAR-04). */
export interface ConfigPesos extends Pesos {
  vigenteDesde: Data;
}

/** Presença de um jogador com a data e a chuva da partida. */
export interface PresencaDoJogador {
  data: Data;
  choveu: boolean;
  situacao: SituacaoGravada;
}

/** Pesos com que todo grupo nasce (RN-18; PAR-13, PAR-15): 1, 1, 1, 1, −1, −1. */
export const PESOS_PADRAO: Readonly<Pesos> = Object.freeze({
  presencaSemChuva: 1,
  presencaComChuva: 1,
  lesionadoSemChuva: 1,
  lesionadoComChuva: 1,
  expulsoSemChuva: -1,
  expulsoComChuva: -1,
});

/** Os nomes dos seis campos de peso, na ordem do formulário. */
export const CAMPOS_DE_PESO = Object.freeze(Object.keys(PESOS_PADRAO) as (keyof Pesos)[]);

/** Pontos de uma presença: o peso da situação, sem ou com chuva conforme a partida (PAR-55). */
export function pontosDaPresenca(situacao: SituacaoGravada, choveu: boolean, pesos: Pesos): number {
  switch (situacao) {
    case 'presente':
      return choveu ? pesos.presencaComChuva : pesos.presencaSemChuva;
    case 'lesionado':
      return choveu ? pesos.lesionadoComChuva : pesos.lesionadoSemChuva;
    case 'expulso':
      return choveu ? pesos.expulsoComChuva : pesos.expulsoSemChuva;
  }
}

/**
 * O grupo tem uma só configuração e ela tem os valores padrão (P10, PAR-135): o início do grupo mostra "Pesos padrão".
 * Duas configurações, mesmo ambas com os valores padrão, mostram "Vigente desde".
 */
export function ehPesosPadrao(configs: readonly ConfigPesos[]): boolean {
  if (configs.length !== 1) return false;
  const unica = configs[0] as ConfigPesos;
  return CAMPOS_DE_PESO.every((campo) => unica[campo] === PESOS_PADRAO[campo]);
}
