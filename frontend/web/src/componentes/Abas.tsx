import { useRef, type KeyboardEvent } from 'react';
import estilos from './Abas.module.css';

/**
 * Abas da lista (GEL-115, GEL-46), com o visual do controle segmentado de
 * `t15-jogadores--sucesso.html` ("Ativos (20)" e "Inativos (0)", `.specs/mockup/base.css:97-105`).
 * SPEC_DEVIATION: o mockup marca o filtro com rádios num `fieldset`; a T57 pede abas que anunciam
 * a ativa com `aria-selected`, então a marcação é `role="tablist"` com botões `role="tab"`, no
 * mesmo visual. Setas esquerda e direita, Home e End movem a aba ativa (padrão do APG), e só a
 * ativa fica na ordem do Tab.
 */

export interface Aba<C extends string = string> {
  chave: C;
  rotulo: string;
  /** Contagem mostrada entre parênteses; ausente, sem contagem. */
  contagem?: number;
}

export interface PropsAbas<C extends string> {
  /** Nome do conjunto para o leitor de tela (ex.: "Mostrar"). */
  rotulo: string;
  abas: readonly Aba<C>[];
  ativa: C;
  aoMudar: (chave: C) => void;
  /** Id do painel que as abas controlam. */
  idPainel?: string;
  /** Prefixo dos ids das abas. */
  id: string;
}

export function textoAba(aba: Aba): string {
  return aba.contagem === undefined ? aba.rotulo : `${aba.rotulo} (${aba.contagem})`;
}

export function Abas<C extends string>({ rotulo, abas, ativa, aoMudar, idPainel, id }: PropsAbas<C>) {
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  function irPara(indice: number) {
    const total = abas.length;
    const alvo = abas[((indice % total) + total) % total];
    if (!alvo) return;
    aoMudar(alvo.chave);
    botoes.current[abas.indexOf(alvo)]?.focus();
  }

  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    if (e.key === 'ArrowRight') irPara(indice + 1);
    else if (e.key === 'ArrowLeft') irPara(indice - 1);
    else if (e.key === 'Home') irPara(0);
    else if (e.key === 'End') irPara(abas.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div className={estilos.abas} role="tablist" aria-label={rotulo}>
      {abas.map((aba, indice) => {
        const selecionada = aba.chave === ativa;
        return (
          <button
            key={aba.chave}
            ref={(el) => {
              botoes.current[indice] = el;
            }}
            id={`${id}-${aba.chave}`}
            className={estilos.aba}
            type="button"
            role="tab"
            aria-selected={selecionada}
            aria-controls={idPainel}
            tabIndex={selecionada ? 0 : -1}
            onClick={() => aoMudar(aba.chave)}
            onKeyDown={(e) => aoTeclar(e, indice)}
          >
            {textoAba(aba)}
          </button>
        );
      })}
    </div>
  );
}
