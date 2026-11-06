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
  meta?: ReactNode | undefined;
  /** Rota do app; o item vira link. */
  para?: string | undefined;
  lateral?: ReactNode | undefined;
  /** Seta à direita (`item__seta`), no item que abre outra tela (T50). */
  seta?: boolean | undefined;
  /** O item quebra a linha quando o conteúdo lateral não cabe (`item--quebra`, base.css:21). */
  quebra?: boolean | undefined;
}

function Seta() {
  return (
    <svg
      className={estilos['item__seta']}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function ItemLista({
  titulo,
  meta,
  para,
  lateral,
  seta = false,
  quebra = false,
}: PropsItemLista) {
  const classe = quebra ? `${estilos.item} ${estilos['item--quebra']}` : estilos.item;
  const conteudo = (
    <>
      <span className={estilos['item__principal']}>
        <span className={estilos['item__titulo']}>{titulo}</span>
        {meta ? <span className={estilos['item__meta']}>{meta}</span> : null}
      </span>
      {lateral}
      {seta ? <Seta /> : null}
    </>
  );
  return (
    <li>
      {para ? (
        <Link className={classe} to={para}>
          {conteudo}
        </Link>
      ) : (
        <div className={classe}>{conteudo}</div>
      )}
    </li>
  );
}
