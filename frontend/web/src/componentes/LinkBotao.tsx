import type { ReactNode } from 'react';
import { Link } from 'react-router';
import estilos from './Botao.module.css';
import { classesDaVariante, type VarianteBotao } from './Botao.tsx';

/**
 * Link do app com a aparência de botão (`a.botao` do mockup: "Esqueci a senha", "Voltar para
 * entrar", "Enviar outro link"). Mesmas classes do `Botao` (ACE-56).
 */

export interface PropsLinkBotao {
  para: string;
  variante?: VarianteBotao | undefined;
  bloco?: boolean | undefined;
  /** Classe extra de layout (ex.: `acima-3`). */
  classe?: string | undefined;
  children: ReactNode;
}

export function LinkBotao({
  para,
  variante = 'texto',
  bloco = false,
  classe,
  children,
}: PropsLinkBotao) {
  const classes = [
    estilos.botao,
    ...classesDaVariante(variante),
    bloco ? estilos['botao--bloco'] : '',
    classe ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Link className={classes} to={para}>
      {children}
    </Link>
  );
}
