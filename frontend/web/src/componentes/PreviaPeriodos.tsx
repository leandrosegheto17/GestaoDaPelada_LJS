import type { PreviaInicioResposta, PreviaResposta } from '@pelada/contrato/previas';
import { Faixa } from './Faixa.tsx';
import estilos from './PreviaPeriodos.module.css';

/**
 * Textos das prévias de período (partidas-e-ranking T65; PAR-117, PAR-118, PAR-119), do mockup do módulo
 * `t16-jogador--{reativar-previa,corrigir-previa,inicio-recuar,inicio-avancar}.html` (R-09, R-11, R-12, R-19):
 * - acumulado: "Acumulado de X pontos passa a Y." ou "Acumulado de X pontos não muda.";
 * - posição: "Posição de N para M.", "Posição N, não muda.", "Passa a aparecer no ranking, na posição M." ou "Sai do
 *   ranking (hoje está na posição N).";
 * - rodadas: "1 rodada passa a constar: 15/10.", "N rodadas passam a constar: 08/10 e 15/10." (e "deixam de constar"),
 *   com até 5 datas e "e mais K" depois disso; o `aviso` da API numa faixa de atenção;
 * - prévia de início, numa frase só: "Acumulado de X pontos passa a Y; posição de N para M. K rodadas passam a
 *   constar.", omitindo as partes que não se aplicam.
 */

export const MAX_DATAS = 5;

/** "2026-10-15" → "15/10". */
function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

/** "X pontos" (singular para 1 e −1). */
function pontos(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? 'ponto' : 'pontos'}`;
}

export function textoAcumulado(antes: number, depois: number): string {
  return antes === depois ? `Acumulado de ${pontos(antes)} não muda.` : `Acumulado de ${pontos(antes)} passa a ${depois}.`;
}

/** As quatro frases de posição (PAR-117); as duas nulas não acontecem (o jogador nunca está no ranking): vazio. */
export function textoPosicao(antes: number | null, depois: number | null): string {
  if (antes === null && depois === null) return '';
  if (antes === null) return `Passa a aparecer no ranking, na posição ${depois}.`;
  if (depois === null) return `Sai do ranking (hoje está na posição ${antes}).`;
  return antes === depois ? `Posição ${antes}, não muda.` : `Posição de ${antes} para ${depois}.`;
}

/** "08/10 e 15/10"; "01/10, 02/10, 03/10, 04/10, 05/10 e mais 2". */
export function listaDeDatas(datas: readonly string[]): string {
  const visiveis = datas.slice(0, MAX_DATAS).map(diaMes);
  const resto = datas.length - visiveis.length;
  if (resto > 0) return `${visiveis.join(', ')} e mais ${resto}`;
  if (visiveis.length <= 1) return visiveis.join('');
  return `${visiveis.slice(0, -1).join(', ')} e ${visiveis.at(-1)}`;
}

export type VerboRodadas = 'passam' | 'deixam' | 'passaram';

const VERBOS: Readonly<Record<VerboRodadas, { um: string; varios: string }>> = {
  passam: { um: 'passa a constar', varios: 'passam a constar' },
  deixam: { um: 'deixa de constar', varios: 'deixam de constar' },
  passaram: { um: 'passou a constar', varios: 'passaram a constar' },
};

/** "1 rodada passa a constar: 15/10.", "2 rodadas deixam de constar: 08/10 e 15/10."; nenhuma: vazio. */
export function textoRodadas(datas: readonly string[], verbo: VerboRodadas): string {
  if (datas.length === 0) return '';
  const v = VERBOS[verbo];
  const quantas = datas.length === 1 ? `1 rodada ${v.um}` : `${datas.length} rodadas ${v.varios}`;
  return `${quantas}: ${listaDeDatas(datas)}.`;
}

/**
 * Frase única da prévia de início (PAR-119). Partes que não se aplicam saem: o acumulado quando não muda, a posição
 * quando não muda (ou não existe) e as rodadas quando são 0.
 * [LACUNA] a spec não diz o texto quando nada muda (acumulado, posição e rodadas): "Acumulado e posição não mudam.".
 */
export function textoPreviaInicio(p: PreviaInicioResposta): string {
  const partes: string[] = [];
  if (p.acumuladoAntes !== p.acumuladoDepois) partes.push(`Acumulado de ${pontos(p.acumuladoAntes)} passa a ${p.acumuladoDepois}`);
  if (p.posicaoAntes !== null && p.posicaoDepois !== null && p.posicaoAntes !== p.posicaoDepois) {
    partes.push(`${partes.length === 0 ? 'Posição' : 'posição'} de ${p.posicaoAntes} para ${p.posicaoDepois}`);
  }
  const k = p.rodadasQuePassamAConstar;
  const rodadas = k === 0 ? '' : k === 1 ? '1 rodada passa a constar.' : `${k} rodadas passam a constar.`;
  if (partes.length === 0 && rodadas === '') return 'Acumulado e posição não mudam.';
  return [partes.length > 0 ? `${partes.join('; ')}.` : '', rodadas].filter(Boolean).join(' ');
}

export function PreviaPeriodos({ previa }: { previa: PreviaResposta }) {
  const passam = textoRodadas(
    previa.rodadasQuePassamAConstar.map((r) => r.data),
    'passam',
  );
  const deixam = textoRodadas(
    previa.rodadasQueDeixamDeConstar.map((r) => r.data),
    'deixam',
  );
  const cenario = [textoAcumulado(previa.acumuladoAntes, previa.acumuladoDepois), textoPosicao(previa.posicaoAntes, previa.posicaoDepois)]
    .filter(Boolean)
    .join(' ');
  return (
    <div aria-live="polite">
      <p className={estilos.paragrafo}>{cenario}</p>
      {passam ? <p className={estilos.paragrafo}>{passam}</p> : null}
      {deixam ? <p className={estilos.paragrafo}>{deixam}</p> : null}
      {previa.aviso ? <Faixa tipo="atencao">{previa.aviso}</Faixa> : null}
    </div>
  );
}

export function PreviaInicio({ previa }: { previa: PreviaInicioResposta }) {
  return (
    <div aria-live="polite">
      <p className={estilos.paragrafo}>{textoPreviaInicio(previa)}</p>
    </div>
  );
}
