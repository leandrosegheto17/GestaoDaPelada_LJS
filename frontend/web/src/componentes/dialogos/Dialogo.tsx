import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { juntar } from '../basicos/juntar';
import { usarFocoModal } from './usarFocoModal';
import estilos from './Dialogo.module.css';

interface Props {
  titulo: string;
  descricao?: ReactNode;
  /** Ação destrutiva: vira `alertdialog` e Esc não fecha. O véu nunca fecha. */
  destrutivo?: boolean;
  /** Esc fecha (padrão: sim, exceto no destrutivo). Na confirmação, Esc equivale a "Cancelar". */
  fecharComEsc?: boolean;
  refFocoInicial?: RefObject<HTMLElement | null>;
  /** O foco inicial vai ao título (que passa a ser focável por programa), não ao primeiro botão. */
  focoNoTitulo?: boolean;
  aoFechar: () => void;
  children?: ReactNode;
  /** Botões, na ordem de leitura (no celular aparecem empilhados com o primeiro embaixo). */
  acoes?: ReactNode;
}

/** Montado = aberto. Quem usa renderiza condicionalmente. */
export function Dialogo({
  titulo,
  descricao,
  destrutivo,
  fecharComEsc,
  refFocoInicial,
  focoNoTitulo,
  aoFechar,
  children,
  acoes,
}: Props) {
  const idTitulo = useId();
  const idDescricao = useId();
  const refConteudo = useRef<HTMLElement>(null);
  const refTitulo = useRef<HTMLHeadingElement>(null);
  usarFocoModal({
    refConteudo,
    refFocoInicial: focoNoTitulo ? refTitulo : refFocoInicial,
    aoFechar,
    fecharComEsc: fecharComEsc ?? !destrutivo,
  });
  return createPortal(
    <div className={estilos.veu}>
      <section
        ref={refConteudo}
        className={juntar(estilos.dialogo, 'dialogo')}
        role={destrutivo ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descricao ? idDescricao : undefined}
        tabIndex={-1}
      >
        <h2 id={idTitulo} ref={refTitulo} className={estilos.titulo} tabIndex={focoNoTitulo ? -1 : undefined}>
          {titulo}
        </h2>
        {descricao ? (
          <p id={idDescricao} className={estilos.texto}>
            {descricao}
          </p>
        ) : null}
        {children}
        {acoes ? <div className={estilos.acoes}>{acoes}</div> : null}
      </section>
    </div>,
    document.body,
  );
}
