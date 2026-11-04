import type { ReactNode } from 'react';
import estilos from './Casca.module.css';
import { Marca } from './Marca.tsx';

interface CascaProps {
  /** Título da página (h1). Sem ele, o conteúdo traz o próprio h1. */
  titulo?: string;
  children?: ReactNode;
}

/** Layout da página: a barra com a marca e a landmark `main` com o conteúdo. */
export function Casca({ titulo, children }: CascaProps) {
  return (
    <>
      <header className={estilos.barra}>
        <Marca />
      </header>
      <main className={estilos.conteudo}>
        {titulo ? <h1 className={estilos.titulo}>{titulo}</h1> : null}
        {children}
      </main>
    </>
  );
}
