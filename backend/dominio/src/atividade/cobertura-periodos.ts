import { compararDatas, somarDias, type Data } from '../datas.ts';
import { ativoEm, formatarData, type Periodo } from './atividade.ts';
import { falhaPeriodo, type FalhaPeriodo } from './validar-periodos.ts';

/** Situação do jogador numa partida. Só presente, lesionado e expulso contam como presença (GEL-68). */
export type SituacaoPresenca = 'presente' | 'lesionado' | 'expulso' | 'ausente';

export interface PresencaJogador {
  /** Data da partida. */
  data: Data;
  situacao: SituacaoPresenca;
}

const CONTAM: ReadonlySet<SituacaoPresenca> = new Set(['presente', 'lesionado', 'expulso']);

export interface EntradaCobertura {
  antes: readonly Periodo[];
  depois: readonly Periodo[];
  presencas: readonly PresencaJogador[];
}

export interface ResultadoCobertura {
  /** Datas de presença cobertas antes e não cobertas depois, em ordem crescente e sem repetição. */
  retiradas: Data[];
  /** Menor data de saída aceita: dia seguinte à presença retirada mais tarde. */
  limiteSaida: Data | null;
  /** Maior data de retorno aceita: dia da presença retirada mais cedo. */
  limiteRetorno: Data | null;
}

/**
 * Presenças que a mudança tira de dentro de um período (GEL-68). A que já estava fora antes (dado importado) não
 * conta, nem a situação ausente.
 */
export function coberturaRetirada(entrada: EntradaCobertura): ResultadoCobertura {
  const datas = entrada.presencas.filter((p) => CONTAM.has(p.situacao)).map((p) => p.data);
  const retiradas = [...new Set(datas)]
    .filter((d) => ativoEm(entrada.antes, d) && !ativoEm(entrada.depois, d))
    .sort(compararDatas);
  if (retiradas.length === 0) return { retiradas, limiteSaida: null, limiteRetorno: null };
  return {
    retiradas,
    limiteSaida: somarDias(retiradas[retiradas.length - 1]!, 1),
    limiteRetorno: retiradas[0]!,
  };
}

export interface EntradaPresencas extends EntradaCobertura {
  /** Início do período editado, já com o retorno novo: separa presença retirada pelo retorno da retirada pela saída. */
  inicioDoAlvo: Data;
  /** O pedido trouxe uma saída (inativar ou corrigir a saída). */
  saidaInformada: boolean;
}

/**
 * Regra de presença do GEL-68, com a mensagem. Presença retirada pela saída tem prioridade quando há saída no pedido;
 * senão, a retirada pelo retorno.
 */
export function validarPresencas(entrada: EntradaPresencas): FalhaPeriodo | null {
  const { retiradas, limiteSaida, limiteRetorno } = coberturaRetirada(entrada);
  if (retiradas.length === 0) return null;
  const peloRetorno = retiradas.filter((d) => compararDatas(d, entrada.inicioDoAlvo) < 0);
  const pelaSaida = retiradas.filter((d) => compararDatas(d, entrada.inicioDoAlvo) >= 0);
  const falhaSaida = (presenca: Data) =>
    falhaPeriodo(
      'presenca',
      'saida',
      `Há presença do jogador em ${formatarData(presenca)}. A saída precisa ser em ${formatarData(limiteSaida!)} ou depois. Para usar uma data anterior, remova a presença em Editar partida.`,
    );
  if (pelaSaida.length > 0 && entrada.saidaInformada) return falhaSaida(pelaSaida[pelaSaida.length - 1]!);
  if (peloRetorno.length > 0) {
    return falhaPeriodo(
      'presenca',
      'retorno',
      `Há presença do jogador em ${formatarData(peloRetorno[0]!)}. O retorno precisa ser em ${formatarData(limiteRetorno!)} ou antes. Para usar uma data posterior, remova a presença em Editar partida.`,
    );
  }
  return falhaSaida(retiradas[retiradas.length - 1]!);
}
