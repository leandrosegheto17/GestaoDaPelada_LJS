import type { ReactNode } from 'react';
import { Link } from 'react-router';
import estilos from './Lista.module.css';

/**
 * Lista de itens (ACE-56), de `.specs/mockup/base.css:143-150` (`.lista`, `.item`): título,
 * linha de apoio e conteúdo à direita. Com `para`, o item inteiro é um link do app.
 */

export function Lista({ rotulo, children }: { rotulo?: string; children: ReactNode }) {
  return (
    <ul className={estilos.lista} aria-label={rotulo}>
      {children}
    </ul>
  );
}

export interface PropsItemLista {
  titulo: ReactNode;
  meta?: ReactNode;
  /** Rota do app; o item vira link. */
  para?: string;
  lateral?: ReactNode;
}

export function ItemLista({ titulo, meta, para, lateral }: PropsItemLista) {
  const conteudo = (
    <>
      <span className={estilos['item__principal']}>
        <span className={estilos['item__titulo']}>{titulo}</span>
        {meta ? <span className={estilos['item__meta']}>{meta}</span> : null}
      </span>
      {lateral}
    </>
  );
  return (
    <li>
      {para ? (
        <Link className={estilos.item} to={para}>
          {conteudo}
        </Link>
      ) : (
        <div className={estilos.item}>{conteudo}</div>
      )}
    </li>
  );
}
