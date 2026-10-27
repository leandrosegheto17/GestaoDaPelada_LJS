import type { ReactNode } from 'react';
import estilos from './CaixaSelecao.module.css';

interface Props {
  /** Texto do rótulo; pode levar links (ex.: aceite dos termos). */
  rotulo?: ReactNode;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  /** Vira `aria-label` quando não há rótulo visível. */
  rotuloAcessivel?: string;
  marcada: boolean;
  aoMudar: (marcada: boolean) => void;
  desabilitada?: boolean;
}

export function CaixaSelecao({ rotulo, rotuloAcessivel, marcada, aoMudar, desabilitada, ...ligacoes }: Props) {
  return (
    <label className={estilos.caixa}>
      <input
        {...ligacoes}
        type="checkbox"
        aria-label={rotulo ? undefined : rotuloAcessivel}
        checked={marcada}
        disabled={desabilitada}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      {rotulo ? <span>{rotulo}</span> : null}
    </label>
  );
}
