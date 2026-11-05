import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import estilosCampo from './Campo.module.css';
import estilos from './CaixaSelecao.module.css';

/**
 * Caixa de seleção (ACE-56, ACE-59), da marcação de `t29-cadastro--vazio.html` e
 * `t29-cadastro--erro.html`: `label.caixa` envolve a caixa e o rótulo, que aceita links (os
 * termos e a política). Nasce desmarcada: nenhum `defaultChecked` aqui, e quem usa controla
 * `checked` (ACE-59). Com erro, mesmo padrão do `Campo`: `campo--erro`, `aria-invalid` e o erro
 * ligado por `aria-describedby`.
 */

export interface PropsCaixaSelecao extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'id' | 'type' | 'defaultChecked' | 'children'
> {
  id: string;
  /** Rótulo; pode ter links. */
  children: ReactNode;
  erro?: string | undefined;
  ref?: Ref<HTMLInputElement> | undefined;
}

function IconeErro() {
  return (
    <svg
      className={estilosCampo.icone}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function CaixaSelecao({
  id,
  children,
  erro,
  ref,
  'aria-describedby': descricaoExtra,
  ...resto
}: PropsCaixaSelecao) {
  const idErro = erro ? `${id}-erro` : undefined;
  const descricao = [descricaoExtra, idErro].filter(Boolean).join(' ') || undefined;
  return (
    <div
      className={[estilosCampo.campo, erro ? estilosCampo['campo--erro'] : '']
        .filter(Boolean)
        .join(' ')}
    >
      <label className={estilos.caixa}>
        <input
          {...resto}
          ref={ref}
          type="checkbox"
          id={id}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricao}
        />
        <span>{children}</span>
      </label>
      {erro ? (
        <p className={estilosCampo['campo__erro']} id={idErro}>
          <IconeErro />
          {erro}
        </p>
      ) : null}
    </div>
  );
}
