/**
 * Função única de acumulado (T5; PAR-58 a PAR-61, G-25): o ranking, o PDF e as prévias contam os pontos só por aqui.
 * As somas internas `acumuladoAte` e `acumuladoComInicial` não saem deste módulo (o `index.ts` não as exporta, e a
 * regra de lint da T51 recusa somar pontos fora do domínio).
 */
import type { Data } from '../atividade/datas.ts';
import { compararDatas } from '../datas.ts';
import { inicioDaContagem } from './inicio.ts';
import { pontosDaPresenca, type ConfigPesos, type PresencaDoJogador } from './pesos.ts';
import { criarResolvedorDePesos, type ResolvedorDePesos } from './resolvedor.ts';

export interface EntradaAcumulado {
  /** Data de início da pontuação (S). Ausente: sem limite inferior no primeiro período. */
  inicio?: Data | undefined;
  pontuacaoInicial: number;
  /** Todo o histórico de presenças do jogador, inclusive as anteriores ao início, em qualquer ordem. */
  presencas: readonly PresencaDoJogador[];
  /** As configurações do grupo ou um resolvedor já pronto (o ranking cria um só para todos os jogadores). */
  configs: readonly ConfigPesos[] | ResolvedorDePesos;
  /** Referência D: soma as presenças até ela, inclusive. */
  referencia: Data;
  /** Períodos do jogador, em qualquer ordem. Com eles, quem saiu e voltou conta só a partir do retorno (PAR-57). */
  periodos?: readonly { inicio: Data }[] | undefined;
  /** Data X que escolhe o período (padrão: a referência); o PTS INICIAL de um mês usa o próprio mês (PAR-74). */
  periodoEm?: Data | undefined;
}

const comoResolvedor = (configs: readonly ConfigPesos[] | ResolvedorDePesos): ResolvedorDePesos =>
  typeof configs === 'function' ? configs : criarResolvedorDePesos(configs);

/** Interna: soma das presenças com `desde ≤ data ≤ referencia`; sem `desde`, sem limite inferior (PAR-58, PAR-60). */
function acumuladoAte(
  presencas: readonly PresencaDoJogador[],
  resolver: ResolvedorDePesos,
  desde: Data | undefined,
  referencia: Data,
): number {
  let total = 0;
  for (const p of presencas) {
    if (desde !== undefined && compararDatas(p.data, desde) < 0) continue;
    if (compararDatas(p.data, referencia) > 0) continue;
    total += pontosDaPresenca(p.situacao, p.choveu, resolver(p.data));
  }
  return total;
}

/** Interna: a pontuação inicial vale quando o início não passa da primeira presença do histórico, ou sem presença. */
function acumuladoComInicial(entrada: EntradaAcumulado, desde: Data | undefined): number {
  let primeira: Data | undefined;
  for (const p of entrada.presencas) {
    if (primeira === undefined || compararDatas(p.data, primeira) < 0) primeira = p.data;
  }
  const inicialVale =
    primeira === undefined || desde === undefined || compararDatas(desde, primeira) <= 0;
  const partidas = acumuladoAte(
    entrada.presencas,
    comoResolvedor(entrada.configs),
    desde,
    entrada.referencia,
  );
  return (inicialVale ? entrada.pontuacaoInicial : 0) + partidas;
}

/**
 * Acumulado de um jogador até a referência D (PAR-58): soma os pontos das presenças do início da contagem
 * (`inicioDaContagem`, PAR-57) até D, inclusive nas duas pontas, mesmo as gravadas fora de período (PAR-60); a pontuação
 * inicial entra só quando o início da contagem é igual ou anterior à primeira presença de todo o histórico, ou quando não
 * há presença (PAR-59). Sem relógio nem I/O (PAR-61).
 */
export function acumuladoPorInicio(entrada: EntradaAcumulado): number {
  const desde = inicioDaContagem(
    entrada.inicio,
    entrada.periodos,
    entrada.periodoEm ?? entrada.referencia,
  );
  return acumuladoComInicial(entrada, desde);
}
