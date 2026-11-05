import { formatarData } from '../elenco/apelido.ts';
import { contem, somarDias, type CampoPeriodo, type Data, type FalhaPeriodo, type Periodo } from './datas.ts';

/**
 * Presença que sai de dentro de um período (GEL-68). Uma presença (presente, lesionado ou expulso) que estava dentro
 * de algum período antes da mudança e fica fora depois bloqueia a mudança. Presença que já estava fora não bloqueia,
 * e ausência nunca conta.
 */

export type SituacaoPresenca = 'presente' | 'lesionado' | 'expulso' | 'ausente';

export interface PresencaJogador {
  data: Data;
  situacao: SituacaoPresenca;
}

export interface Retirada {
  data: Data;
  /** Qual borda do período a deixou de fora: a saída (que veio antes dela) ou o retorno (que foi para depois). */
  por: CampoPeriodo;
}

/**
 * As presenças retiradas pela mudança, em ordem de data. `depois[i]` é `antes[i]` com a mudança aplicada (um período a
 * mais no fim, quando a operação é reativar). A borda é o retorno quando a presença ficou antes do início do período
 * que a continha; senão, a saída.
 */
export function coberturaRetirada(
  antes: readonly Periodo[],
  depois: readonly Periodo[],
  presencas: readonly PresencaJogador[],
): Retirada[] {
  const retiradas: Retirada[] = [];
  for (const presenca of presencas) {
    if (presenca.situacao === 'ausente') continue;
    const indice = antes.findIndex((p) => contem(p, presenca.data));
    if (indice < 0) continue; // já estava fora: não bloqueia
    if (depois.some((p) => contem(p, presenca.data))) continue;
    const novo = depois[indice];
    const por: CampoPeriodo = novo && presenca.data < novo.inicio ? 'retorno' : 'saida';
    retiradas.push({ data: presenca.data, por });
  }
  return retiradas.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

/**
 * A falha da presença retirada, ou nulo. Pela saída: a data mostrada é a da última presença retirada e a saída
 * mínima é o dia seguinte. Pelo retorno: a data é a da primeira presença retirada, que é também o retorno máximo.
 * Com as duas bordas (correção de saída e retorno juntos), a saída vem primeiro.
 */
export function falhaPresenca(retiradas: readonly Retirada[]): FalhaPeriodo | null {
  const pelaSaida = retiradas.filter((r) => r.por === 'saida');
  const ultima = pelaSaida[pelaSaida.length - 1];
  if (ultima) {
    return {
      ok: false,
      regra: 'presenca',
      mensagem: `Há presença do jogador em ${formatarData(ultima.data)}. A saída precisa ser em ${formatarData(
        somarDias(ultima.data, 1),
      )} ou depois. Para usar uma data anterior, remova a presença em Editar partida.`,
      campo: 'saida',
    };
  }
  const primeira = retiradas.find((r) => r.por === 'retorno');
  if (primeira) {
    return {
      ok: false,
      regra: 'presenca',
      mensagem: `Há presença do jogador em ${formatarData(primeira.data)}. O retorno precisa ser em ${formatarData(
        primeira.data,
      )} ou antes. Para usar uma data posterior, remova a presença em Editar partida.`,
      campo: 'retorno',
    };
  }
  return null;
}
