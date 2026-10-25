import type { ComponentPropsWithRef, MouseEvent } from 'react';
import { classesBotao, type VarianteBotao } from './classesBotao';

interface Props extends Omit<ComponentPropsWithRef<'button'>, 'className'> {
  variante?: VarianteBotao;
  bloco?: boolean;
  topo?: boolean;
  carregando?: boolean;
  /** Texto exibido enquanto `carregando` (ex.: "Salvando…"); sem ele, o rótulo normal fica. */
  rotuloCarregando?: string;
}

export function Botao({
  variante,
  bloco,
  topo,
  carregando = false,
  rotuloCarregando,
  type = 'button',
  onClick,
  children,
  ...resto
}: Props) {
  const aoClicar = (evento: MouseEvent<HTMLButtonElement>) => {
    if (carregando) {
      evento.preventDefault();
      return;
    }
    onClick?.(evento);
  };
  return (
    <button
      {...resto}
      type={type}
      className={classesBotao({ variante, bloco, topo, carregando })}
      data-variante={variante === 'texto' ? 'texto' : undefined}
      aria-disabled={carregando || undefined}
      aria-busy={carregando || undefined}
      onClick={aoClicar}
    >
      {carregando && rotuloCarregando ? rotuloCarregando : children}
    </button>
  );
}
