import type { ReactNode } from 'react';
import estilos from './ValorDestaque.module.css';

/** Valor em destaque (nível do jogador, saldo do caixa); mudanças são anunciadas aos leitores de tela. */
export function ValorDestaque({ children }: { children: ReactNode }) {
  return (
    <p className={estilos.valor} aria-live="polite">
      {children}
    </p>
  );
}
