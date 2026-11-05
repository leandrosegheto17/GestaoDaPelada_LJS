import type { ReactNode } from 'react';
import estilos from './Casca.module.css';

/**
 * Casca da página (FUN-31): barra superior e a landmark `main`, a partir de
 * `.specs/mockup/telas/padrao--erro-rede.html` (barra do admin, com o grupo) e
 * `t03-indisponivel--erro.html` (barra pública, com o nome do app).
 */

export const NOME_DO_APP = 'Gestão da Pelada';

export interface GrupoDaBarra {
  nome: string;
  /** Endereço do link "Trocar grupo"; ausente, o link não aparece. */
  trocarHref?: string;
}

export interface PropsCasca {
  /** Título da página (`h1.titulo-pagina`). Ausente: a página põe o próprio título. */
  titulo?: string;
  /** Barra do admin com o grupo; ausente, a barra pública com o nome do app. */
  grupo?: GrupoDaBarra;
  /** Conteúdo centralizado na tela (mensagens: indisponível, offline, em breve). */
  centralizada?: boolean;
  /** Coluna estreita dos formulários de acesso (`conteudo--estreito`, `t04-entrar--vazio`). */
  estreita?: boolean;
  /** Marca a área principal como ocupada (carregando). */
  ocupada?: boolean;
  /** Ações à direita da barra (`barra__acoes`: o menu da conta, T50). */
  acoes?: ReactNode;
  children?: ReactNode;
}

export function Casca({ titulo, grupo, centralizada = false, estreita = false, ocupada = false, acoes, children }: PropsCasca) {
  const classeMain = centralizada
    ? estilos['tela-mensagem']
    : [estilos.conteudo, grupo ? estilos['conteudo--admin'] : '', estreita ? estilos['conteudo--estreito'] : '']
        .filter(Boolean)
        .join(' ');
  return (
    <>
      <header className={[estilos.barra, grupo ? estilos['barra--admin'] : ''].filter(Boolean).join(' ')}>
        {grupo ? (
          <div className={estilos['barra__grupo']}>
            <span className={estilos['barra__nome']}>{grupo.nome}</span>
            {grupo.trocarHref ? (
              <a className={estilos['barra__link']} href={grupo.trocarHref}>
                Trocar grupo
              </a>
            ) : null}
          </div>
        ) : (
          <p className={estilos['barra__titulo']}>{NOME_DO_APP}</p>
        )}
        {acoes ? (
          <nav className={estilos['barra__acoes']} aria-label="Atalhos">
            {acoes}
          </nav>
        ) : null}
      </header>
      <main className={classeMain} aria-busy={ocupada || undefined}>
        {titulo ? <h1 className={estilos['titulo-pagina']}>{titulo}</h1> : null}
        {children}
      </main>
    </>
  );
}
