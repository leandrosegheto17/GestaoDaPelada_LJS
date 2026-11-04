import { useParams } from 'react-router';
import { Casca } from '../componentes/Casca.tsx';
import { EsqueletoLista } from '../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../componentes/EstadoErro.tsx';
import { TelaMensagem } from '../componentes/TelaMensagem.tsx';
import { NaoEncontrada } from './paginas.tsx';

/** Vitrine dos componentes para a comparação visual (T62). Só entra no build com `VITE_VITRINE=1`. */
export default function Vitrine() {
  const { id } = useParams();
  switch (id) {
    case 'erro-rede':
      return (
        <Casca titulo="Partidas">
          <EstadoErro aoTentarDeNovo={() => undefined} />
        </Casca>
      );
    case 'carregando-lista':
      return (
        <Casca titulo="Jogadores">
          <EsqueletoLista />
        </Casca>
      );
    case 'indisponivel':
      return (
        <Casca>
          <TelaMensagem
            titulo="Grupo indisponível"
            texto="Este grupo não está disponível no momento. Fale com o admin do seu grupo."
          />
        </Casca>
      );
    default:
      return <NaoEncontrada />;
  }
}
