/**
 * Plano efetivo do grupo (T1; PLA-01 a PLA-04, PLA-70, PLA-71). Único lugar que decide o plano a partir da situação
 * comercial gravada em `grupos.situacao_comercial` (AD-088). Sem relógio e sem I/O (AD-028): "hoje" chega de fora, já
 * convertido para a data de São Paulo pelo Relógio da API (a conversão 23:59 e 00:00 é provada na T24).
 *
 * Casos limite (Domínio: sim):
 * - `uso_proprio` é cortesia, sem data de fim (PLA-02);
 * - `trial`: trial enquanto `hoje < trialInicio + 14` (o 14º dia, contando o dia da criação, é o último Pro; AD-087);
 *   criado em 2026-11-01, último dia Pro 2026-11-14, Free em 2026-11-15 (PLA-03);
 * - `trial` com `trialInicio` no futuro: segue trial, sem erro (PLA-70);
 * - `trial` sem `trialInicio`: o CHECK `grupos_trial` não deixa existir; se chegar, vale `free` (conservador);
 * - `ativo` é Pro, sem olhar `pagoAte` (o webhook leva a `inadimplente` ou `cancelado`); `inadimplente` é Free (PLA-04);
 * - `cancelado`: Pro até `pagoAte` inclusive, Free depois; sem `pagoAte`, Free (conservador);
 * - virada do mês e do ano: a soma de dias é a do calendário (`somarDias`).
 */
import { somarDias, type Data } from '../atividade/datas.ts';

/** Os 5 valores do CHECK de `grupos.situacao_comercial` (`linha-de-base.sql:72-78`). */
export const SITUACOES_COMERCIAIS = [
  'uso_proprio',
  'trial',
  'ativo',
  'inadimplente',
  'cancelado',
] as const;
export type SituacaoComercial = (typeof SITUACOES_COMERCIAIS)[number];

/** O plano que vale para o grupo. O Free não é situação gravada: é o que sobra. */
export const PLANOS = ['cortesia', 'trial', 'pro', 'free'] as const;
export type Plano = (typeof PLANOS)[number];

/** Dias de trial Pro de todo grupo novo (PLA-03). */
export const DIAS_DE_TRIAL = 14;

/**
 * Primeiro dia depois do trial: `trialInicio + 14`. O trial vale enquanto `hoje` for menor que esta data, então o
 * último dia Pro é a véspera (AD-087).
 *
 * [LACUNA] A spec pede `trialFimEm` na resposta de `GET …/plano` (PLA-08) sem dizer se é o último dia Pro (14/11) ou o
 * primeiro dia Free (15/11). Aqui `fimDoTrial` é o primeiro dia Free (o limite exclusivo da regra) e
 * `ultimoDiaDoTrial` é o último dia Pro; a T24 escolhe qual vai na resposta.
 */
export function fimDoTrial(trialInicio: Data): Data {
  return somarDias(trialInicio, DIAS_DE_TRIAL);
}

/** Último dia em que o trial ainda é Pro (o 14º dia contando o da criação). */
export function ultimoDiaDoTrial(trialInicio: Data): Data {
  return somarDias(trialInicio, DIAS_DE_TRIAL - 1);
}

/**
 * O plano efetivo do grupo hoje (data de São Paulo, `AAAA-MM-DD`). Datas em texto `AAAA-MM-DD`: a ordem do texto é a
 * do calendário.
 */
export function planoEfetivo(
  situacaoComercial: SituacaoComercial,
  trialInicio: Data | null,
  pagoAte: Data | null,
  hoje: Data,
): Plano {
  switch (situacaoComercial) {
    case 'uso_proprio':
      return 'cortesia';
    case 'trial':
      if (trialInicio === null) return 'free';
      return hoje < fimDoTrial(trialInicio) ? 'trial' : 'free';
    case 'ativo':
      return 'pro';
    case 'inadimplente':
      return 'free';
    case 'cancelado':
      if (pagoAte === null) return 'free';
      return hoje <= pagoAte ? 'pro' : 'free';
    default: {
      // Valor fora do CHECK: nunca libera o Pro (conservador).
      const _nunca: never = situacaoComercial;
      void _nunca;
      return 'free';
    }
  }
}
