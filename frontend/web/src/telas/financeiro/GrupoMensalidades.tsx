import type { LancamentoDoMes } from '@pelada/contrato/financeiro';
import { useId, useState } from 'react';
import lista from '../../componentes/Lista.module.css';
import { formatarReais } from '../../dados/dinheiro.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { diaEMes, IconeTipo, ItemLancamento } from './ItemLancamento.tsx';

/**
 * Linha agrupada das mensalidades do mês (financeiro T40; FIN-15), de `t22-financeiro--sucesso.html:54-56`: as
 * entradas de mensalidade do mês numa linha só, "16 mensalidades de 10/2026" (ou "1 mensalidade de 10/2026"), com o
 * intervalo de datas ("01/10 a 15/10", ou só "01/10" quando todas são do mesmo dia), "Entrada", o selo "mensalidade" e o
 * total. A linha é um botão com `aria-expanded`: aberta, mostra cada mensalidade com o link de edição.
 *
 * O total soma inteiros; passar do inteiro seguro lança (como no domínio, FIN-13).
 */

export const TEXTO_AJUDA_MENSALIDADES = 'As mensalidades do mês aparecem numa linha só; toque para ver cada uma.';

/** `2026-10` → "16 mensalidades de 10/2026". */
export function rotuloMensalidades(quantidade: number, mes: string): string {
  const [ano, numero] = mes.split('-');
  return `${quantidade} ${quantidade === 1 ? 'mensalidade' : 'mensalidades'} de ${numero}/${ano}`;
}

/** "01/10 a 15/10", ou "01/10" com uma data só. */
export function intervaloDeDatas(datas: readonly string[]): string {
  const ordenadas = [...datas].sort();
  const primeira = ordenadas[0] ?? '';
  const ultima = ordenadas[ordenadas.length - 1] ?? '';
  return primeira === ultima ? diaEMes(primeira) : `${diaEMes(primeira)} a ${diaEMes(ultima)}`;
}

export function totalDe(lancamentos: readonly LancamentoDoMes[]): number {
  const total = lancamentos.reduce((soma, l) => soma + l.valorCentavos, 0);
  if (!Number.isSafeInteger(total)) throw new RangeError('Soma das mensalidades além do inteiro seguro.');
  return total;
}

export interface PropsGrupoMensalidades {
  mes: string;
  /** Só as entradas de mensalidade do mês. */
  mensalidades: readonly LancamentoDoMes[];
  base: string;
}

export function GrupoMensalidades({ mes, mensalidades, base }: PropsGrupoMensalidades) {
  const [aberta, setAberta] = useState(false);
  const idLista = useId();
  if (mensalidades.length === 0) return null;
  return (
    <li>
      <button
        type="button"
        className={lista.item}
        aria-expanded={aberta}
        aria-controls={idLista}
        onClick={() => setAberta((a) => !a)}
      >
        <span className={lista['item__principal']}>
          <span className={lista['item__titulo']}>{rotuloMensalidades(mensalidades.length, mes)}</span>
          <span className={lista['item__meta']}>
            {intervaloDeDatas(mensalidades.map((m) => m.data))} · <IconeTipo tipo="entrada" /> Entrada ·{' '}
            <span className={`${estilos.selo} ${estilos['selo--neutro']}`}>mensalidade</span>
          </span>
        </span>
        <span className={modulo['item-lado']}>{formatarReais(totalDe(mensalidades))}</span>
      </button>
      {aberta ? (
        <ul className={lista.lista} id={idLista} aria-label={rotuloMensalidades(mensalidades.length, mes)}>
          {mensalidades.map((l) => (
            <ItemLancamento key={l.id} l={l} base={base} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
