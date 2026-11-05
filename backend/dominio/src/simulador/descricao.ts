/**
 * Descrição da prévia (T4; SIM-10 a SIM-13): o texto que a tela mostra no lugar da prévia, montado no domínio para a
 * tela só formatar (SIM-15). Textos de `S:111-114`; regra do legado `aplicacao/simulador/descricao.ts`, escrita do zero.
 */
import type { Previa } from './previa.ts';

const contar = (quantos: number, singular: string, plural: string): string =>
  `${quantos} ${quantos === 1 ? singular : plural}`;

/** "2 times de 7 · 5 reservas", "2 times de 7 · 1 reserva", "2 times de 7"; ou o motivo de não sair. */
export function descreverPrevia(previa: Previa): string {
  if (previa.formato === 'dois_times') {
    if (previa.valida) {
      const base = `2 times de ${previa.n}`;
      return previa.reservas > 0 ? `${base} · ${contar(previa.reservas, 'reserva', 'reservas')}` : base;
    }
    return previa.maiorNPossivel === null
      ? 'Faltam aptos para 2 times.'
      : `Faltam aptos para 2 times de ${previa.n}. Maior N possível: ${previa.maiorNPossivel}.`;
  }
  if (previa.valida) {
    const completos = `${contar(previa.timesCompletos, 'time', 'times')} de ${previa.n}`;
    return previa.tamanhoIncompleto > 0 ? `${completos} + 1 time incompleto de ${previa.tamanhoIncompleto}` : completos;
  }
  const base = `Com ${previa.aptos} aptos e N = ${previa.n} não há 3 times.`;
  const nMenor = previa.nSugerido !== null;
  if (nMenor && previa.doisTimesPossivel) return `${base} Use N menor ou o formato 2 times.`;
  if (nMenor) return `${base} Use N menor.`;
  if (previa.doisTimesPossivel) return `${base} Use o formato 2 times.`;
  return base;
}
