import { formatarData } from '../elenco/apelido.ts';
import { sobrepoem, type CampoPeriodo, type FalhaPeriodo, type Periodo } from './datas.ts';

/**
 * Ordem e sobreposição dos períodos (GEL-65, GEL-66, GEL-67). Recebem os períodos já com a mudança aplicada, na ordem
 * cronológica de antes da mudança (o índice de cada período não muda), e o índice e o campo do período mudado.
 * As datas vêm validadas (GEL-63, GEL-64 antes, pela ordem do GEL-62).
 */

function falha(regra: FalhaPeriodo['regra'], mensagem: string, campo: CampoPeriodo): FalhaPeriodo {
  return { ok: false, regra, mensagem, campo };
}

/**
 * Regras de ordem do período `indice` cujo `campo` mudou:
 * - saída antes do início do próprio período (GEL-65);
 * - saída depois do retorno seguinte (GEL-66);
 * - retorno antes da saída do período anterior (GEL-66);
 * - retorno depois da saída do próprio período (GEL-66).
 * Saída igual ao início do período (período vazio) e retorno igual à saída anterior (sair e voltar no mesmo dia,
 * GEL-61) valem. Devolve a primeira falha, ou nulo.
 */
export function verificarOrdem(
  periodos: readonly Periodo[],
  indice: number,
  campo: CampoPeriodo,
): FalhaPeriodo | null {
  const atual = periodos[indice];
  if (!atual) throw new Error(`Período ${indice} inexistente`);
  const anterior = periodos[indice - 1];
  const seguinte = periodos[indice + 1];

  if (campo === 'saida') {
    if (atual.fim === null) return null;
    if (atual.fim < atual.inicio) {
      return falha(
        'saida-antes-do-inicio',
        `A saída não pode ser antes do início deste período (${formatarData(atual.inicio)}).`,
        'saida',
      );
    }
    if (seguinte && atual.fim > seguinte.inicio) {
      return falha(
        'saida-depois-do-proximo-retorno',
        `A saída não pode ser depois do próximo retorno (${formatarData(seguinte.inicio)}).`,
        'saida',
      );
    }
    return null;
  }

  if (anterior && anterior.fim !== null && atual.inicio < anterior.fim) {
    return falha(
      'retorno-antes-da-saida-anterior',
      `O retorno não pode ser antes da saída anterior (${formatarData(anterior.fim)}).`,
      'retorno',
    );
  }
  if (atual.fim !== null && atual.inicio > atual.fim) {
    return falha(
      'retorno-depois-da-saida',
      `O retorno não pode ser depois da saída deste período (${formatarData(atual.fim)}).`,
      'retorno',
    );
  }
  return null;
}

export const MENSAGEM_SOBREPOSICAO = 'Os períodos não podem se sobrepor.';

/** Algum par de períodos com dia em comum (GEL-67), ou mais de um aberto. Devolve a falha, ou nulo. */
export function verificarSobreposicao(
  periodos: readonly Periodo[],
  campo: CampoPeriodo,
): FalhaPeriodo | null {
  for (let i = 0; i < periodos.length; i++) {
    for (let j = i + 1; j < periodos.length; j++) {
      const a = periodos[i];
      const b = periodos[j];
      if (a && b && sobrepoem(a, b)) return falha('sobreposicao', MENSAGEM_SOBREPOSICAO, campo);
    }
  }
  return null;
}
