import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import estilos from './Dialogo.module.css';

/**
 * Diálogo modal (ACE-56), de `t32-conta--excluir.html`: véu, `section.dialogo` com
 * `aria-modal`, título e texto ligados por `aria-labelledby`/`aria-describedby`, botão
 * "Fechar" no canto e as ações embaixo. `alerta` usa `role="alertdialog"` (ação destrutiva);
 * senão, `role="dialog"`.
 *
 * Foco: ao abrir, vai ao elemento com `autoFocus` (como o "Cancelar" do mockup) ou, sem ele,
 * ao primeiro focável; Tab e Shift+Tab ficam presos no diálogo; Esc chama `aoFechar`; ao
 * fechar, o foco volta a quem o tinha antes. Quem usa monta e desmonta o diálogo.
 */

export interface PropsDialogo {
  titulo: string;
  descricao?: ReactNode;
  aoFechar: () => void;
  alerta?: boolean;
  children?: ReactNode;
  acoes?: ReactNode;
}

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focaveis(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(FOCAVEIS));
}

export function Dialogo({ titulo, descricao, aoFechar, alerta = false, children, acoes }: PropsDialogo) {
  const base = useId();
  const idTitulo = `${base}-titulo`;
  const idTexto = `${base}-texto`;
  const ref = useRef<HTMLElement>(null);
  // Lido no primeiro render, antes de o autoFocus do React mover o foco para dentro do diálogo.
  const [anterior] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const raiz = ref.current;
    if (raiz && !raiz.contains(document.activeElement)) focaveis(raiz)[0]?.focus();
    return () => {
      anterior?.focus();
    };
  }, [anterior]);

  const aoTeclar = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      aoFechar();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const lista = focaveis(ref.current);
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    if (!primeiro || !ultimo) return;
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  return (
    <div className={estilos.veu}>
      <section
        ref={ref}
        className={estilos.dialogo}
        role={alerta ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descricao ? idTexto : undefined}
        onKeyDown={aoTeclar}
      >
        <button className={estilos['dialogo__fechar']} type="button" aria-label="Fechar" onClick={aoFechar}>
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <h2 id={idTitulo} className={estilos['dialogo__titulo']}>
          {titulo}
        </h2>
        {descricao ? (
          <p id={idTexto} className={estilos['dialogo__texto']}>
            {descricao}
          </p>
        ) : null}
        {children}
        {acoes ? <div className={estilos['dialogo__acoes']}>{acoes}</div> : null}
      </section>
    </div>
  );
}
