import type { Periodo } from '../atividade/datas.ts';
import { primeiroDia, ultimoDia } from '../datas.ts';
import { compararApelido } from '../elenco/apelido.ts';
import type { AtivoNoMes, MesCaixa } from './resumo.ts';

/**
 * Quem conta no mês do caixa (FIN-11, FIN-12, FIN-19). Ativo no mês = algum período [início, fim) contém ao menos um
 * dia do mês. Períodos da grupos-e-elenco (`atividade/datas.ts`), datas em `AAAA-MM-DD` comparadas como texto; sem
 * relógio (GEL-70).
 */

export interface JogadorComPeriodos {
  jogadorId: string;
  apelido: string;
  periodos: readonly Periodo[];
}

/** O período cobre ao menos um dia entre o primeiro e o último dia do mês. Período vazio (início = fim) não cobre. */
function tocaOMes(periodo: Periodo, inicioMes: string, fimMes: string): boolean {
  if (periodo.fim !== null && periodo.fim <= periodo.inicio) return false;
  const comecaAteOFim = periodo.inicio <= fimMes;
  const terminaDepoisDoInicio = periodo.fim === null || periodo.fim > inicioMes;
  return comecaAteOFim && terminaDepoisDoInicio;
}

/** Verdadeiro se algum período contém ao menos um dia do mês. Saída no dia 1 (`fim` = dia 1) não conta o mês. */
export function ativoNoMes(periodos: readonly Periodo[], mes: MesCaixa): boolean {
  const inicioMes = primeiroDia(mes);
  const fimMes = ultimoDia(mes);
  return periodos.some((p) => tocaOMes(p, inicioMes, fimMes));
}

/**
 * Os ativos no mês, cada jogador uma vez (quem saiu e voltou no mesmo mês, ou chegou repetido, conta uma vez),
 * ordenados pelo apelido sem acento e sem caixa (`compararApelido`). Os períodos de linhas repetidas do mesmo
 * jogador se somam.
 */
export function ativosNoMes(jogadores: readonly JogadorComPeriodos[], mes: MesCaixa): AtivoNoMes[] {
  const porId = new Map<string, { apelido: string; periodos: Periodo[] }>();
  for (const j of jogadores) {
    const atual = porId.get(j.jogadorId);
    if (atual) atual.periodos.push(...j.periodos);
    else porId.set(j.jogadorId, { apelido: j.apelido, periodos: [...j.periodos] });
  }
  const ativos: AtivoNoMes[] = [];
  for (const [jogadorId, { apelido, periodos }] of porId) {
    if (ativoNoMes(periodos, mes)) ativos.push({ jogadorId, apelido });
  }
  return ativos.sort((a, b) => compararApelido(a.apelido, b.apelido));
}
