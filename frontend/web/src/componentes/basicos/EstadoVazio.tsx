import type { ReactNode } from 'react';
import { Icone, type NomeIcone } from './Icone';
import estilos from './EstadoVazio.module.css';

interface Props {
  /** Ícone acima do título (padrão `info`); `null` não mostra ícone. */
  icone?: NomeIcone | null;
  /** Sem título, só o texto aparece (estados vazios de seção). */
  titulo?: string;
  /** Nível do título na hierarquia da página (padrão 2). */
  nivel?: 2 | 3;
  texto?: ReactNode;
  acao?: ReactNode;
}

export function EstadoVazio({ icone = 'info', titulo, nivel = 2, texto, acao }: Props) {
  const Titulo = nivel === 2 ? 'h2' : 'h3';
  return (
    <div className={estilos.vazio}>
      {icone ? (
        <div className={estilos.icone}>
          <Icone nome={icone} tamanho={48} />
        </div>
      ) : null}
      {titulo ? <Titulo className={estilos.titulo}>{titulo}</Titulo> : null}
      {texto ? <p className={estilos.texto}>{texto}</p> : null}
      {acao}
    </div>
  );
}
