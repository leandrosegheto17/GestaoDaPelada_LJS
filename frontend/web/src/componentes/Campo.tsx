import { useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { Botao } from './Botao.tsx';
import estilos from './Campo.module.css';

/**
 * Campo de formulário (ACE-56), da marcação do mockup (`t04-entrar--erro.html`,
 * `t29-cadastro--erro.html`, `t31-convite--sem-conta.html`) e de `.specs/mockup/base.css:81-89`:
 * - rótulo ligado à entrada por `for`/`id`;
 * - ajuda e erro ligados por `aria-describedby` (ajuda primeiro, como no mockup); com erro, a
 *   entrada ganha `aria-invalid` e o campo, `campo--erro`;
 * - somente leitura com `readonly` e `aria-readonly` (e-mail travado do convite).
 *
 * `CampoSenha` põe o botão "Mostrar" ao lado (`campo__linha`), com `aria-pressed` e
 * `aria-controls`, e alterna o `type` entre `password` e `text`.
 */

export interface PropsCampo extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'id' | 'readOnly'
> {
  id: string;
  rotulo: string;
  ajuda?: ReactNode | undefined;
  /** Mensagem de erro do campo; vazia ou ausente, sem erro. */
  erro?: string | undefined;
  somenteLeitura?: boolean | undefined;
  /** Conteúdo ao lado da entrada, na mesma linha (o botão do `CampoSenha`). */
  lateral?: ReactNode | undefined;
  ref?: Ref<HTMLInputElement> | undefined;
}

function IconeErro() {
  return (
    <svg
      className={estilos.icone}
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

export function Campo({
  id,
  rotulo,
  ajuda,
  erro,
  somenteLeitura = false,
  lateral,
  ref,
  'aria-describedby': descricaoExtra,
  ...resto
}: PropsCampo) {
  const idAjuda = ajuda ? `${id}-ajuda` : undefined;
  const idErro = erro ? `${id}-erro` : undefined;
  const descricao = [descricaoExtra, idAjuda, idErro].filter(Boolean).join(' ') || undefined;
  const entrada = (
    <input
      {...resto}
      ref={ref}
      id={id}
      className={estilos['campo__entrada']}
      readOnly={somenteLeitura || undefined}
      aria-readonly={somenteLeitura || undefined}
      aria-invalid={erro ? true : undefined}
      aria-describedby={descricao}
    />
  );
  return (
    <div className={[estilos.campo, erro ? estilos['campo--erro'] : ''].filter(Boolean).join(' ')}>
      <label className={estilos['campo__rotulo']} htmlFor={id}>
        {rotulo}
      </label>
      {lateral ? (
        <div className={estilos['campo__linha']}>
          {entrada}
          {lateral}
        </div>
      ) : (
        entrada
      )}
      {ajuda ? (
        <p className={estilos['campo__ajuda']} id={idAjuda}>
          {ajuda}
        </p>
      ) : null}
      {erro ? (
        <p className={estilos['campo__erro']} id={idErro}>
          <IconeErro />
          {erro}
        </p>
      ) : null}
    </div>
  );
}

export type PropsCampoSenha = Omit<PropsCampo, 'type' | 'lateral'>;

export function CampoSenha(props: PropsCampoSenha) {
  const [visivel, setVisivel] = useState(false);
  return (
    <Campo
      {...props}
      type={visivel ? 'text' : 'password'}
      lateral={
        <Botao
          variante="secundario"
          aria-pressed={visivel}
          aria-controls={props.id}
          onClick={() => setVisivel((v) => !v)}
        >
          Mostrar
        </Botao>
      }
    />
  );
}
