import type { ReactNode } from 'react';
import { juntar } from './juntar';
import estilos from './Selo.module.css';

export type TomSelo = 'neutro' | 'info' | 'atencao' | 'erro' | 'sucesso';

interface Props {
  tom?: TomSelo;
  /** Texto obrigatório: o selo nunca comunica só por cor. */
  children: ReactNode;
}

export function Selo({ tom = 'neutro', children }: Props) {
  return <span className={juntar(estilos.selo, estilos[tom])}>{children}</span>;
}
