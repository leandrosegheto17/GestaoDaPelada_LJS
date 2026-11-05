import { useParams } from 'react-router';
import { Casca } from '../componentes/Casca.tsx';
import { EsqueletoLista } from '../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../componentes/EstadoErro.tsx';
import { NaoEncontrada } from '../paginas/Mensagens.tsx';

/**
 * Telas de vitrine (FUN-38): as 3 telas do mockup que a fundação reproduz, para a comparação
 * visual. Só existem no build de teste (`VITE_VITRINE=1`, ver `app/rotas.tsx`).
 */

const GRUPO = { nome: 'Pelada de Quinta', trocarHref: '/grupos' };

function ErroRede() {
  // .specs/mockup/telas/padrao--erro-rede.html
  return (
    <Casca titulo="Partidas" grupo={GRUPO}>
      <EstadoErro aoTentarDeNovo={() => undefined} />
    </Casca>
  );
}

function CarregandoLista() {
  // .specs/mockup/telas/padrao--carregando-lista.html
  return (
    <Casca titulo="Jogadores" grupo={GRUPO} ocupada>
      <EsqueletoLista />
    </Casca>
  );
}

function Indisponivel() {
  // .specs/mockup/telas/t03-indisponivel--erro.html
  return (
    <Casca centralizada>
      <EstadoErro
        formato="tela"
        titulo="Grupo indisponível"
        mensagem="Este grupo não está disponível no momento. Fale com o admin do seu grupo."
      />
    </Casca>
  );
}

export const TELAS_VITRINE = {
  'erro-rede': ErroRede,
  'carregando-lista': CarregandoLista,
  indisponivel: Indisponivel,
} as const;

export function Vitrine() {
  const { id } = useParams();
  const Tela =
    id && Object.hasOwn(TELAS_VITRINE, id) ? TELAS_VITRINE[id as keyof typeof TELAS_VITRINE] : null;
  return Tela ? <Tela /> : <NaoEncontrada />;
}
