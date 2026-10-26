import type { ReactNode } from 'react';
import estilos from './Lista.module.css';

interface Props {
  /** Nome acessível da lista (opcional). */
  rotulo?: string;
  /** Id do elemento visível que dá nome à lista (alternativa a `rotulo`). */
  rotuladaPor?: string;
  children: ReactNode;
}

export function Lista({ rotulo, rotuladaPor, children }: Props) {
  return (
    <ul className={estilos.lista} aria-label={rotulo} aria-labelledby={rotuladaPor}>
      {children}
    </ul>
  );
}
