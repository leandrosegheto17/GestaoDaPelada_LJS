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
  /**
   * Desabilitado (planos-e-cobranca T48; PLA-22): um link não tem `disabled`, então vira um `<button disabled>` com as
   * mesmas classes, fora da ordem de navegação e anunciado como indisponível.
   */
  desabilitado?: boolean | undefined;
  children: ReactNode;
}

export function LinkBotao({
  para,
  variante = 'texto',
  bloco = false,
  classe,
  desabilitado = false,
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
  if (desabilitado) {
    return (
      <button type="button" className={classes} disabled>
        {children}
      </button>
    );
  }
  return (
    <Link className={classes} to={para}>
      {children}
    </Link>
  );
}
