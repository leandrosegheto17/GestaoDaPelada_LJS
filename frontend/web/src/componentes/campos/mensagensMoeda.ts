import { formatarMoeda, type MotivoMoeda } from '../../formatacao';

/** Texto de erro para cada motivo de `lerMoeda`. */
export function mensagemMoeda(motivo: MotivoMoeda, texto: string, faixa: { min: number; max: number }): string {
  switch (motivo) {
    case 'vazio':
      return 'Informe o valor.';
    case 'formato':
      return 'Informe um valor em reais, ex.: 350,00.';
    case 'casas':
      return 'Use no máximo 2 casas decimais.';
    case 'faixa':
      if (faixa.min >= 1 && /^[^1-9]*$/.test(texto)) return 'O valor precisa ser maior que zero.';
      if (faixa.min < 0) {
        return `O valor precisa estar entre ${formatarMoeda(faixa.min)} e ${formatarMoeda(faixa.max)}.`;
      }
      return `O valor pode ser no máximo ${formatarMoeda(faixa.max)}.`;
  }
}
