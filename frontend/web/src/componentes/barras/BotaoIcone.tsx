import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { juntar } from '../basicos/juntar';
import estilos from './Barra.module.css';

interface Comum {
  /** Obrigatório: o botão só tem ícone. */
  rotulo: string;
  semBorda?: boolean;
  children: ReactNode;
}

type Props = Comum &
  (
    | { para: string; aoNavegar?: (evento: MouseEvent) => void; aoClicar?: never; menu?: never }
    | { para?: never; aoNavegar?: never; aoClicar: () => void; menu?: { aberto: boolean } }
  );

/** Link ou botão quadrado só com ícone, para as barras sobre o verde. */
export function BotaoIcone({ rotulo, semBorda, children, para, aoNavegar, aoClicar, menu }: Props) {
  const classe = juntar(estilos.botaoIcone, semBorda && estilos.semBorda);
  if (para !== undefined) {
    return (
      <Link to={para} className={classe} aria-label={rotulo} onClick={aoNavegar}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={classe}
      aria-label={rotulo}
      aria-haspopup={menu ? 'true' : undefined}
      aria-expanded={menu ? menu.aberto : undefined}
      onClick={aoClicar}
    >
      {children}
    </button>
  );
}
