import { formatarData } from '../elenco/apelido.ts';
import { coberturaRetirada, falhaPresenca, type PresencaJogador } from './cobertura.ts';
import {
  ehDataValida,
  ehFutura,
  MENSAGEM_DATA_INVALIDA,
  MENSAGEM_FUTURO,
  type CampoPeriodo,
  type Data,
  type FalhaPeriodo,
  type Periodo,
} from './datas.ts';
import { verificarOrdem, verificarSobreposicao } from './ordem.ts';

/**
 * Avaliação das escritas de período: inativar, reativar e corrigir (GEL-58, GEL-62, GEL-69, GEL-72, GEL-73).
 * Aplica a mudança aos períodos e avalia as regras na ordem do GEL-62 (data válida, campo corrigível, não futura,
 * ordem, sobreposição, presença, início da pontuação), devolvendo só a primeira falha. Função pura: `hoje` é
 * parâmetro e a transação, a trava e a gravação são do repositório (GEL-109).
 */

export type OperacaoPeriodo =
  /** Encerra o período aberto na data de saída. */
  | { tipo: 'inativar'; saida: unknown }
  /** Abre um período novo a partir da data de retorno. */
  | { tipo: 'reativar'; retorno: unknown }
  /** Corrige a saída (período encerrado) e/ou o retorno (período que não é o primeiro) de um período. */
  | { tipo: 'corrigir'; periodoId: string; saida?: unknown; retorno?: unknown };

export interface EntradaAvaliacao {
  /** Os períodos do jogador, em ordem de início; na correção, cada um com `id`. */
  periodos: readonly Periodo[];
  operacao: OperacaoPeriodo;
  /** As presenças do jogador em partidas do grupo. */
  presencas: readonly PresencaJogador[];
  /** `jogadores.inicio_pontuacao`; nulo = início do primeiro período. */
  inicioPontuacao: Data | null;
  hoje: Data;
}

export type ResultadoAvaliacao = { ok: true; periodos: Periodo[]; alterado: boolean } | FalhaPeriodo;

export const MENSAGEM_SEM_SAIDA = 'Este período não tem data de saída.';
export const MENSAGEM_INICIO_DO_PRIMEIRO =
  'O início do primeiro período é a data de início da pontuação; use Alterar data de início.';

/** Erro de uso: a operação não cabe no estado (ex.: inativar quem já está inativo, que o repositório responde 409). */
export class EstadoDePeriodoInvalido extends Error {}

interface Mudanca {
  indice: number;
  campo: CampoPeriodo;
  valor: unknown;
}

function falha(regra: FalhaPeriodo['regra'], mensagem: string, campo: CampoPeriodo): FalhaPeriodo {
  return { ok: false, regra, mensagem, campo };
}

/** As mudanças pedidas, cada uma com o índice do período e o campo. Na correção, a saída vem antes do retorno. */
function mudancasDe(periodos: readonly Periodo[], operacao: OperacaoPeriodo): Mudanca[] {
  if (operacao.tipo === 'inativar') {
    const indice = periodos.findIndex((p) => p.fim === null);
    if (indice < 0) throw new EstadoDePeriodoInvalido('O jogador não tem período aberto.');
    return [{ indice, campo: 'saida', valor: operacao.saida }];
  }
  if (operacao.tipo === 'reativar') {
    if (periodos.some((p) => p.fim === null)) throw new EstadoDePeriodoInvalido('O jogador já tem período aberto.');
    return [{ indice: periodos.length, campo: 'retorno', valor: operacao.retorno }];
  }
  const indice = periodos.findIndex((p) => p.id === operacao.periodoId);
  if (indice < 0) throw new EstadoDePeriodoInvalido('Período inexistente.');
  const mudancas: Mudanca[] = [];
  if (operacao.saida !== undefined) mudancas.push({ indice, campo: 'saida', valor: operacao.saida });
  if (operacao.retorno !== undefined) mudancas.push({ indice, campo: 'retorno', valor: operacao.retorno });
  return mudancas;
}

/** Falha de campo que não se corrige (GEL-72, GEL-73), ou nulo. Só na correção. */
function naoCorrigivel(periodos: readonly Periodo[], m: Mudanca): FalhaPeriodo | null {
  const periodo = periodos[m.indice];
  if (m.campo === 'saida' && periodo?.fim === null) return falha('nao-corrigivel', MENSAGEM_SEM_SAIDA, 'saida');
  if (m.campo === 'retorno' && m.indice === 0) return falha('nao-corrigivel', MENSAGEM_INICIO_DO_PRIMEIRO, 'retorno');
  return null;
}

/** Os períodos com as mudanças aplicadas; na reativação, o período novo no fim. */
function aplicar(periodos: readonly Periodo[], mudancas: readonly Mudanca[]): Periodo[] {
  const depois: Periodo[] = periodos.map((p) => ({ ...p }));
  for (const m of mudancas) {
    const valor = m.valor as Data;
    if (m.indice === depois.length) depois.push({ inicio: valor, fim: null });
    const alvo = depois[m.indice];
    if (!alvo) continue;
    if (m.campo === 'saida') alvo.fim = valor;
    else alvo.inicio = valor;
  }
  return depois;
}

export function avaliarPeriodos(entrada: EntradaAvaliacao): ResultadoAvaliacao {
  const { periodos, operacao, presencas, inicioPontuacao, hoje } = entrada;
  const mudancas = mudancasDe(periodos, operacao);

  // 1. Data válida (GEL-63).
  for (const m of mudancas) {
    if (!ehDataValida(m.valor)) return falha('data-invalida', MENSAGEM_DATA_INVALIDA, m.campo);
  }
  // 2. Campo corrigível (GEL-72, GEL-73).
  if (operacao.tipo === 'corrigir') {
    for (const m of mudancas) {
      const f = naoCorrigivel(periodos, m);
      if (f) return f;
    }
    // Datas iguais às atuais: nada a gravar (GEL-74).
    const iguais = mudancas.every((m) => {
      const p = periodos[m.indice];
      return m.campo === 'saida' ? p?.fim === m.valor : p?.inicio === m.valor;
    });
    if (iguais) return { ok: true, periodos: periodos.map((p) => ({ ...p })), alterado: false };
  }
  // 3. Não futura (GEL-64).
  for (const m of mudancas) {
    if (ehFutura(m.valor as Data, hoje)) return falha('futuro', MENSAGEM_FUTURO, m.campo);
  }

  const depois = aplicar(periodos, mudancas);

  // 4. Ordem (GEL-65, GEL-66).
  for (const m of mudancas) {
    const f = verificarOrdem(depois, m.indice, m.campo);
    if (f) return f;
  }
  // 5. Sobreposição (GEL-67).
  const campoPrincipal = mudancas[0]?.campo ?? 'saida';
  const sobreposicao = verificarSobreposicao(depois, campoPrincipal);
  if (sobreposicao) return sobreposicao;
  // 6. Presença retirada (GEL-68).
  const presenca = falhaPresenca(coberturaRetirada(periodos, depois, presencas));
  if (presenca) return presenca;
  // 7. Saída do primeiro período antes do início da pontuação (GEL-69).
  // Só quando a mudança é a saída do primeiro período: um histórico antigo fora da regra não trava outras escritas.
  const primeiro = depois[0];
  const mudaSaidaDoPrimeiro = mudancas.some((m) => m.indice === 0 && m.campo === 'saida');
  if (
    mudaSaidaDoPrimeiro &&
    inicioPontuacao !== null &&
    primeiro &&
    primeiro.fim !== null &&
    primeiro.fim < inicioPontuacao
  ) {
    return falha(
      'antes-do-inicio-da-pontuacao',
      `A saída do primeiro período não pode ser antes da data de início da pontuação (${formatarData(
        inicioPontuacao,
      )}). Para ir antes, altere primeiro a data de início.`,
      'saida',
    );
  }

  return { ok: true, periodos: depois, alterado: true };
}
