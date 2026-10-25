import { Link } from 'react-router';
import { Icone } from '../basicos/Icone';
import { juntar } from '../basicos/juntar';
import { BotaoIcone } from './BotaoIcone';
import estilos from './Barra.module.css';

export interface PropsMenuConta {
  menuAberto?: boolean;
  /** Abre a folha do menu da conta (a folha em si é do layout). */
  aoAbrirMenu?: (() => void) | undefined;
}

interface Props extends PropsMenuConta {
  nome: string;
  textoLink?: string;
  destinoLink?: string;
  destinoRanking?: string;
}

/** Estrutura comum das barras de admin e do dono. */
export function BarraInterna({ nome, textoLink, destinoLink, destinoRanking, menuAberto = false, aoAbrirMenu }: Props) {
  return (
    <header className={juntar(estilos.barra, estilos.interna)}>
      <div className={estilos.grupo}>
        <span className={estilos.nome}>{nome}</span>
        {textoLink && destinoLink ? (
          <Link className={estilos.link} to={destinoLink}>
            {textoLink}
          </Link>
        ) : null}
      </div>
      {destinoRanking || aoAbrirMenu ? (
        <nav className={estilos.acoes} aria-label="Atalhos">
          {destinoRanking ? (
            <BotaoIcone rotulo="Ver ranking" para={destinoRanking} semBorda>
              <Icone nome="lista" tamanho={24} />
            </BotaoIcone>
          ) : null}
          {aoAbrirMenu ? (
            <BotaoIcone rotulo="Menu da conta" aoClicar={aoAbrirMenu} menu={{ aberto: menuAberto }} semBorda>
              <Icone nome="conta" tamanho={24} />
            </BotaoIcone>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
