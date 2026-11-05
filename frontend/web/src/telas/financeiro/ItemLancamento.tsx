import type { LancamentoDoMes } from '@pelada/contrato/financeiro';
import { ItemLista } from '../../componentes/Lista.tsx';
import { formatarReais } from '../../dados/dinheiro.ts';
import modulo from '../grupos-elenco.module.css';

/**
 * Item de lançamento da lista do mês (t22; FIN-14, FIN-15): descrição, "20/10 · Saída" e o valor com o sinal, com o
 * link de edição (t23). Usado pela `FinanceiroMes` (T38) e pela linha agrupada das mensalidades (T40).
 */

/** `2026-10-20` → "20/10". */
export function diaEMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** Valor do lançamento com o sinal: a saída com "−". */
export function valorDoLancamento(l: Pick<LancamentoDoMes, 'tipo' | 'valorCentavos'>): string {
  return formatarReais(l.tipo === 'saida' ? -l.valorCentavos : l.valorCentavos);
}

export function IconeTipo({ tipo }: { tipo: 'entrada' | 'saida' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={tipo === 'saida' ? 'M12 5v14M19 12l-7 7-7-7' : 'M12 19V5M5 12l7-7 7 7'} />
    </svg>
  );
}

export function ItemLancamento({ l, base }: { l: LancamentoDoMes; base: string }) {
  return (
    <ItemLista
      titulo={l.descricao}
      meta={
        <>
          {diaEMes(l.data)} · <IconeTipo tipo={l.tipo} /> {l.tipo === 'saida' ? 'Saída' : 'Entrada'}
        </>
      }
      lateral={<span className={modulo['item-lado']}>{valorDoLancamento(l)}</span>}
      para={`${base}/financeiro/lancamentos/${encodeURIComponent(l.id)}`}
    />
  );
}
