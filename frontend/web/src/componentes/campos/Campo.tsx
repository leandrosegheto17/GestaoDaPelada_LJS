import { useId, type ReactNode } from 'react';
import { Icone } from '../basicos/Icone';
import { juntar } from '../basicos/juntar';
import estilos from './Campo.module.css';

export interface PropsDeEntrada {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  className: string;
}

export interface PropsCampo {
  rotulo: string;
  /** Rótulo só para leitor de tela, quando o título da seção já o mostra. */
  rotuloOculto?: boolean;
  ajuda?: string;
  /** Id de texto externo ao campo (ex.: ajuda compartilhada por vários campos) que também o descreve. */
  descritoPor?: string;
  erro?: string | undefined;
  /** `true` quando o campo é validado sozinho (sem `ResumoErros`): o erro vira `role=alert`. */
  erroComoAlerta?: boolean;
  /** Id da entrada (padrão: gerado). Útil para o link do `ResumoErros`. */
  id?: string;
  /** Classe extra da entrada (ex.: `nota`). */
  classeEntrada?: string;
  /** Conteúdo ao lado da entrada (botão "Mostrar", etc.), dentro da mesma linha. */
  lado?: ReactNode;
  children: (entrada: PropsDeEntrada) => ReactNode;
}

/** Moldura de qualquer campo: rótulo, ajuda e erro ligados à entrada por `aria-describedby`. */
export function Campo({
  rotulo,
  rotuloOculto,
  ajuda,
  descritoPor,
  erro,
  erroComoAlerta,
  id,
  classeEntrada,
  lado,
  children,
}: PropsCampo) {
  const gerado = useId();
  const idEntrada = id ?? gerado;
  const idAjuda = `${idEntrada}-ajuda`;
  const idErro = `${idEntrada}-erro`;
  const descricao = [ajuda ? idAjuda : null, descritoPor ?? null, erro ? idErro : null].filter(Boolean).join(' ');
  const entrada = children({
    id: idEntrada,
    'aria-describedby': descricao || undefined,
    'aria-invalid': erro ? true : undefined,
    className: juntar(estilos.entrada, classeEntrada && estilos[classeEntrada as 'nota']),
  });
  return (
    <div className={juntar(estilos.campo, erro && estilos.comErro)}>
      <label className={rotuloOculto ? 'sr' : estilos.rotulo} htmlFor={idEntrada}>
        {rotulo}
      </label>
      {lado ? (
        <div className={estilos.linha}>
          {entrada}
          {lado}
        </div>
      ) : (
        entrada
      )}
      {ajuda ? (
        <p id={idAjuda} className={estilos.ajuda}>
          {ajuda}
        </p>
      ) : null}
      {erro ? (
        <p id={idErro} className={estilos.erro} role={erroComoAlerta ? 'alert' : undefined}>
          <Icone nome="atencao" tamanho={16} />
          {erro}
        </p>
      ) : null}
    </div>
  );
}
