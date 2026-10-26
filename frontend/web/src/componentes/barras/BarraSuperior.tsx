import type { MouseEvent } from 'react';
import { recursos } from '../../config/recursos';
import { Icone } from '../basicos/Icone';
import { BotaoIcone } from './BotaoIcone';
import estilos from './Barra.module.css';

interface Props {
  titulo: string;
  subtitulo?: string;
  /** Destino da engrenagem "Área do admin" (decisão da tela). */
  destinoAdmin: string;
  /** Destino do "$" "Financeiro" (decisão da tela). */
  destinoFinanceiro: string;
  /** Chamado ao tocar nos acessos (a tela pode impedir a navegação, ex.: sem conexão). */
  aoNavegar?: (evento: MouseEvent) => void;
}

/** Barra pública com gramado: nome do grupo e acessos dos admins. */
export function BarraSuperior({ titulo, subtitulo, destinoAdmin, destinoFinanceiro, aoNavegar }: Props) {
  return (
    <header className={estilos.barra}>
      <div>
        <h1 className={estilos.titulo}>{titulo}</h1>
        {subtitulo ? <p className={estilos.sub}>{subtitulo}</p> : null}
      </div>
      <nav className={estilos.acoes} aria-label="Acesso dos admins">
        <BotaoIcone rotulo="Área do admin" para={destinoAdmin} {...(aoNavegar ? { aoNavegar } : {})}>
          <Icone nome="engrenagem" tamanho={24} />
        </BotaoIcone>
        {recursos.ligado('financeiro') ? (
          <BotaoIcone rotulo="Financeiro" para={destinoFinanceiro} {...(aoNavegar ? { aoNavegar } : {})}>
            <span aria-hidden="true">$</span>
          </BotaoIcone>
        ) : null}
      </nav>
    </header>
  );
}
