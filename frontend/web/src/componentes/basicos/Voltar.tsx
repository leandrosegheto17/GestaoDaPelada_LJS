import { Link } from 'react-router';
import { Icone } from './Icone';
import estilos from './Voltar.module.css';

interface Props {
  /** Destino do link; sem ele o componente é um botão e `aoClicar` é obrigatório na prática. */
  para?: string;
  /** Ex.: "Voltar ao ranking". */
  rotulo: string;
  /** Troca a navegação do link (ex.: voltar no histórico); `para` segue valendo para quem abre em outra aba. */
  aoClicar?: () => void;
}

export function Voltar({ para, rotulo, aoClicar }: Props) {
  if (para === undefined) {
    return (
      <button type="button" className={estilos.voltar} onClick={aoClicar}>
        <Icone nome="anterior" />
        {rotulo}
      </button>
    );
  }
  return (
    <Link
      className={estilos.voltar}
      to={para}
      onClick={
        aoClicar
          ? (evento) => {
              if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
              evento.preventDefault();
              aoClicar();
            }
          : undefined
      }
    >
      <Icone nome="anterior" />
      {rotulo}
    </Link>
  );
}
