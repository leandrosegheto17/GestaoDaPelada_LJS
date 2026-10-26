import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Selo } from '../basicos/Selo';
import estilos from './Folha.module.css';

type Props = {
  /** Opção atualmente em uso: `aria-current` e o selo "atual". */
  atual?: boolean;
  children: ReactNode;
} & ({ para: string; aoEscolher?: never } | { para?: never; aoEscolher: () => void });

export function OpcaoFolha({ atual, children, para, aoEscolher }: Props) {
  const conteudo = (
    <>
      <span>{children}</span>
      {atual ? <Selo>atual</Selo> : null}
    </>
  );
  return (
    <li>
      {para !== undefined ? (
        <Link className={estilos.opcao} to={para} aria-current={atual ? 'true' : undefined}>
          {conteudo}
        </Link>
      ) : (
        <button type="button" className={estilos.opcao} aria-current={atual ? 'true' : undefined} onClick={aoEscolher}>
          {conteudo}
        </button>
      )}
    </li>
  );
}
