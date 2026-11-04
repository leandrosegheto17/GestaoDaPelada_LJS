import type { ReactNode } from 'react';
import estilos from './Casca.module.css';
import { Marca } from './Marca.tsx';

interface CascaProps {
  /** Título da página (h1). Sem ele, o conteúdo traz o próprio h1. */
  titulo?: string;
  /** `admin` mostra o nome do grupo e o link "Trocar grupo" na barra, em vez da marca. */
  variante?: 'publica' | 'admin';
  /** Nome do grupo na barra da variante `admin`. */
  grupo?: string;
  /** `false` tira o limite de largura e o espaçamento do `main`, para a tela de mensagem. */
  moldura?: boolean;
  children?: ReactNode;
}

const juntar = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' ');

/** Layout da página: a barra (marca, ou grupo no admin) e a landmark `main` com o conteúdo. */
export function Casca({
  titulo,
  variante = 'publica',
  grupo,
  moldura = true,
  children,
}: CascaProps) {
  const admin = variante === 'admin';
  return (
    <>
      <header className={juntar(estilos.barra, admin && estilos.barraAdmin)}>
        {admin ? (
          <div className={estilos.grupo}>
            <span className={estilos.nomeGrupo}>{grupo}</span>
            <a className={estilos.trocar} href="/grupos">
              Trocar grupo
            </a>
          </div>
        ) : (
          <Marca />
        )}
      </header>
      <main
        className={juntar(
          estilos.conteudo,
          admin && estilos.conteudoAdmin,
          !moldura && estilos.semMoldura,
        )}
      >
        {titulo ? <h1 className={estilos.titulo}>{titulo}</h1> : null}
        {children}
      </main>
    </>
  );
}
