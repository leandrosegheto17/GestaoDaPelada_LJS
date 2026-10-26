import { useEffect, useRef, type RefObject } from 'react';
import { focaveisEm } from './focaveis';

const CLASSE_ROLAGEM = 'rolagem-bloqueada';

interface Opcoes {
  refConteudo: RefObject<HTMLElement | null>;
  /** Elemento que recebe o foco ao abrir (padrão: o primeiro focável, ou o próprio conteúdo). */
  refFocoInicial?: RefObject<HTMLElement | null> | undefined;
  aoFechar: () => void;
  fecharComEsc: boolean;
}

/**
 * Comportamento de modal, único para `Dialogo` e `Folha`: foco inicial, foco preso, Esc,
 * rolagem do corpo bloqueada e devolução do foco. Montado = aberto.
 */
export function usarFocoModal({ refConteudo, refFocoInicial, aoFechar, fecharComEsc }: Opcoes): void {
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;

  useEffect(() => {
    const conteudo = refConteudo.current;
    if (!conteudo) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add(CLASSE_ROLAGEM);
    (refFocoInicial?.current ?? focaveisEm(conteudo)[0] ?? conteudo).focus();

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && fecharComEsc) {
        evento.preventDefault();
        aoFecharRef.current();
        return;
      }
      if (evento.key !== 'Tab') return;
      const itens = focaveisEm(conteudo);
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      if (!primeiro || !ultimo) {
        evento.preventDefault();
        conteudo.focus();
        return;
      }
      const ativo = document.activeElement;
      const dentro = ativo instanceof Node && conteudo.contains(ativo);
      const antesDoPrimeiro =
        ativo instanceof Node && (ativo.compareDocumentPosition(primeiro) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      if (evento.shiftKey && (ativo === primeiro || !dentro || ativo === conteudo || antesDoPrimeiro)) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && (ativo === ultimo || !dentro)) {
        evento.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.classList.remove(CLASSE_ROLAGEM);
      if (anterior && document.contains(anterior)) anterior.focus();
    };
  }, [refConteudo, refFocoInicial, fecharComEsc]);
}
