import { useEffect, useRef } from 'react';
import { Botao } from './Botao.tsx';
import estilos from './EstadoErro.module.css';

/**
 * Estado de erro (FUN-31), em dois formatos do mockup:
 * - `faixa` (`.specs/mockup/telas/padrao--erro-rede.html`): faixa `role="alert"` com ícone,
 *   texto e o botão "Tentar de novo"; o foco vai para o botão.
 * - `tela` (`t03-indisponivel--erro.html`): ícone, título e texto centrados; o foco vai para o
 *   título, e o botão aparece só com `aoTentarDeNovo`.
 *
 * O mockup é estático e não diz onde fica o foco: a regra acima é a do rascunho (ver a nota da
 * T49 no tasks.md).
 */

export const TEXTO_ERRO_REDE = 'Não foi possível carregar. Verifique a conexão.';

export interface PropsEstadoErro {
  formato?: 'faixa' | 'tela';
  /** Título (só no formato tela). */
  titulo?: string;
  mensagem?: string;
  aoTentarDeNovo?: () => void;
}

function IconeAlerta() {
  return (
    <svg
      className={estilos.icone}
      viewBox="0 0 24 24"
      width="20"
      height="20"
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

function IconeIndisponivel() {
  return (
    <svg
      className={estilos['vazio__icone']}
      viewBox="0 0 24 24"
      width="56"
      height="56"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M4.9 4.9l14.2 14.2" />
    </svg>
  );
}

export function EstadoErro({ formato = 'faixa', titulo, mensagem = TEXTO_ERRO_REDE, aoTentarDeNovo }: PropsEstadoErro) {
  const refBotao = useRef<HTMLButtonElement>(null);
  const refTitulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (formato === 'faixa') refBotao.current?.focus();
    else refTitulo.current?.focus();
  }, [formato]);

  if (formato === 'tela') {
    return (
      <>
        <IconeIndisponivel />
        <h1 className={estilos['vazio__titulo']} ref={refTitulo} tabIndex={-1}>
          {titulo}
        </h1>
        <p className={estilos['vazio__texto']}>{mensagem}</p>
        {aoTentarDeNovo ? (
          <Botao variante="secundario" onClick={aoTentarDeNovo} ref={refBotao}>
            Tentar de novo
          </Botao>
        ) : null}
      </>
    );
  }

  return (
    <div className={`${estilos.faixa} ${estilos['faixa--erro']}`} role="alert">
      <IconeAlerta />
      <p className={estilos['faixa__texto']}>{mensagem}</p>
      {aoTentarDeNovo ? (
        <span className={estilos.acao}>
          <Botao variante="texto" onClick={aoTentarDeNovo} ref={refBotao}>
            Tentar de novo
          </Botao>
        </span>
      ) : null}
    </div>
  );
}
