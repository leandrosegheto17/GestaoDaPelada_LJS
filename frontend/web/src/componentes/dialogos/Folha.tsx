import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usarFocoModal } from './usarFocoModal';
import estilos from './Folha.module.css';

interface Props {
  titulo: string;
  aoFechar: () => void;
  /** Normalmente uma lista de `OpcaoFolha` dentro de `ListaFolha`, mais conteúdo extra. */
  children: ReactNode;
}

/** Folha inferior no celular, menu central a partir de 600 px. Montada = aberta. */
export function Folha({ titulo, aoFechar, children }: Props) {
  const idTitulo = useId();
  const refConteudo = useRef<HTMLElement>(null);
  usarFocoModal({ refConteudo, aoFechar, fecharComEsc: true });
  return createPortal(
    <div
      className={estilos.veu}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <section
        ref={refConteudo}
        className={estilos.folha}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
      >
        <h2 id={idTitulo} className={estilos.titulo}>
          {titulo}
        </h2>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function ListaFolha({ children }: { children: ReactNode }) {
  return <ul className={estilos.opcoes}>{children}</ul>;
}
