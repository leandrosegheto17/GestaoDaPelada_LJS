import type { ButtonHTMLAttributes, MouseEvent, Ref } from 'react';
import estilos from './Botao.module.css';

/**
 * Botão (FUN-31), de `.specs/mockup/base.css:55-64`. Carregando segue o mockup
 * (`t04-entrar--carregando`): `disabled`, `aria-busy` e o texto da ação em andamento.
 */

export type VarianteBotao = 'principal' | 'secundario' | 'texto';

export interface PropsBotao extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variante?: VarianteBotao;
  /** Ocupa a largura toda (`botao--bloco`). */
  bloco?: boolean;
  carregando?: boolean;
  /** React 19: `ref` é uma prop comum; vai para o `<button>` (o EstadoErro foca o botão). */
  ref?: Ref<HTMLButtonElement>;
}

export function Botao({
  variante = 'principal',
  bloco = false,
  carregando = false,
  disabled = false,
  type = 'button',
  onClick,
  children,
  ref,
  ...resto
}: PropsBotao) {
  const classes = [
    estilos.botao,
    estilos[`botao--${variante}`],
    bloco ? estilos['botao--bloco'] : '',
    carregando ? estilos['botao--carregando'] : '',
  ]
    .filter(Boolean)
    .join(' ');
  const inativo = disabled || carregando;
  const aoClicar = (e: MouseEvent<HTMLButtonElement>) => {
    if (inativo) return;
    onClick?.(e);
  };
  return (
    <button
      {...resto}
      ref={ref}
      type={type}
      className={classes}
      disabled={inativo}
      aria-busy={carregando || undefined}
      onClick={aoClicar}
    >
      {children}
    </button>
  );
}
