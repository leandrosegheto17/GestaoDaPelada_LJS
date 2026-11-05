import type { ButtonHTMLAttributes, MouseEvent, Ref } from 'react';
import estilos from './Botao.module.css';

/**
 * Botão (FUN-31), de `.specs/mockup/base.css:55-64`. Carregando segue o mockup
 * (`t04-entrar--carregando`): `disabled`, `aria-busy` e o texto da ação em andamento.
 *
 * `destrutivo` e `texto-destrutivo` (T51, `t32-conta--excluir.html`, `t32-conta--sucesso.html`):
 * o botão cheio da ação que não se desfaz e o link de texto em vermelho que a abre; o
 * `texto-destrutivo` leva também as classes do `texto` (`botao--texto botao--texto-destrutivo`).
 */

export type VarianteBotao =
  'principal' | 'secundario' | 'texto' | 'destrutivo' | 'texto-destrutivo';

/** Classes de uma variante (o `LinkBotao` usa as mesmas). */
export function classesDaVariante(variante: VarianteBotao): string[] {
  if (variante === 'texto-destrutivo')
    return [estilos['botao--texto'] ?? '', estilos['botao--texto-destrutivo'] ?? ''];
  return [estilos[`botao--${variante}`] ?? ''];
}

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
    ...classesDaVariante(variante),
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
