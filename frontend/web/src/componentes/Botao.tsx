import type { ReactNode } from 'react';
import estilos from './Botao.module.css';

interface BotaoProps {
  variante?: 'primario' | 'secundario';
  carregando?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  children: ReactNode;
}

/** Botão do guia: primário, secundário, desabilitado e carregando. Desabilitado e carregando não disparam o clique. */
export function Botao({
  variante = 'primario',
  carregando = false,
  disabled = false,
  type = 'button',
  onClick,
  children,
}: BotaoProps) {
  const classes = [estilos.botao, estilos[variante], carregando ? estilos.carregando : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
