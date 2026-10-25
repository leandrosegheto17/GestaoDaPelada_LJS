import type { ReactNode } from 'react';
import { juntar } from '../basicos/juntar';
import estilos from './BarraAcao.module.css';

interface Props {
  /** No PC (≥ 600 px) a barra some, em vez de ficar estática. */
  soCelular?: boolean;
  resumo?: string;
  children: ReactNode;
}

/** Ação principal da tela: fixa no rodapé no celular, estática no PC. */
export function BarraAcao({ soCelular, resumo, children }: Props) {
  return (
    <div className={juntar(estilos.barraAcao, soCelular && estilos.soCelular)}>
      {resumo ? <p className={estilos.resumo}>{resumo}</p> : null}
      {children}
    </div>
  );
}
