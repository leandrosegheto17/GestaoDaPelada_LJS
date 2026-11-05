import { useEffect, useRef, type MouseEvent } from 'react';
import estilos from './ResumoErros.module.css';

/**
 * Resumo de erros do formulário (ACE-56), de `t29-cadastro--erro.html`: faixa de erro com
 * `role="alert"`, o título "Corrija N campos:" e um link por campo. O foco vai para o resumo
 * quando ele aparece ou muda; o link leva o foco ao campo (sem mudar a URL).
 */

export interface ErroDoResumo {
  /** `id` do campo com erro. */
  id: string;
  rotulo: string;
}

export interface PropsResumoErros {
  erros: readonly ErroDoResumo[];
}

export function tituloDoResumo(n: number): string {
  return n === 1 ? 'Corrija 1 campo:' : `Corrija ${n} campos:`;
}

export function ResumoErros({ erros }: PropsResumoErros) {
  const ref = useRef<HTMLDivElement>(null);
  const chave = erros.map((e) => e.id).join('|');

  useEffect(() => {
    if (chave) ref.current?.focus();
  }, [chave]);

  if (erros.length === 0) return null;

  const irPara = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const alvo = document.getElementById(id);
    if (!alvo) return;
    e.preventDefault();
    alvo.focus();
  };

  return (
    <div className={`${estilos.faixa} ${estilos['faixa--erro']} ${estilos['resumo-erros']}`} role="alert" tabIndex={-1} ref={ref}>
      <div className={estilos['faixa__texto']}>
        <strong>{tituloDoResumo(erros.length)}</strong>
        <ul>
          {erros.map((e) => (
            <li key={e.id}>
              <a href={`#${e.id}`} onClick={irPara(e.id)}>
                {e.rotulo}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
