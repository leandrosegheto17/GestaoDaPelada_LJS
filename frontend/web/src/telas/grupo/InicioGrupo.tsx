import { useParams } from 'react-router';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { ItemLista, Lista } from '../../componentes/Lista.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { useGrupo } from '../../dados/grupos.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import { textoRecorrencia } from '../grupos/recorrencia.ts';

/**
 * Início do grupo (`/app/grupos/:grupoId`, t09; GEL-20, GEL-114), de `t09-inicio--sucesso.html` e
 * `t09-inicio--sem-jogadores.html` do mockup do módulo:
 * - barra com o nome do grupo e "Trocar grupo" (`/app`); título só para o leitor de tela;
 * - "Gerenciar" com Jogadores ("20 ativos"), Habilidades ("6 habilidades"), Admins ("1 admin") e
 *   Dados do grupo (a recorrência e "link do ranking"), contados do `GET /api/grupos/:grupoId`
 *   (`useGrupo`, T53);
 * - sem jogador ativo, o "Dia de jogo" pede o cadastro ("Cadastrar jogadores");
 * - sem "Pontuação" (decisão de `GD:5-6`). Partidas, Dia de jogo com partida, Uso do app e
 *   Financeiro são das features seguintes, que estendem esta tela (GEL-116: a t09 fica fora da
 *   comparação visual até lá, AD-029).
 */

export const TEXTO_SEM_JOGADORES = 'Cadastre os jogadores para lançar partidas.';

export function textoJogadores(n: number): string {
  // [LACUNA] o mockup só mostra "Nenhum cadastrado" (grupo novo); com só inativos, o texto segue o mesmo.
  if (n === 0) return 'Nenhum cadastrado';
  return n === 1 ? '1 ativo' : `${n} ativos`;
}

export function textoHabilidades(n: number): string {
  if (n === 0) return 'Nenhuma habilidade';
  return n === 1 ? '1 habilidade' : `${n} habilidades`;
}

export function textoAdmins(n: number): string {
  return n === 1 ? '1 admin' : `${n} admins`;
}

export function InicioGrupo() {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const base = rotaDoGrupo(grupoId);
  const nome = grupo.data?.nome ?? NOME_DO_APP;

  function conteudo() {
    if (grupo.isPending) return <EsqueletoLista linhas={4} />;
    if (grupo.isError) {
      if (grupo.error instanceof ErroApi && grupo.error.status === 404) {
        return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      }
      return <EstadoErro aoTentarDeNovo={() => void grupo.refetch()} />;
    }
    const g = grupo.data;
    return (
      <>
        {g.jogadoresAtivos === 0 ? (
          <section className={modulo['dia-de-jogo']} aria-labelledby="t-dia">
            <h2 id="t-dia" className={modulo['dia-de-jogo__titulo']}>
              Dia de jogo
            </h2>
            <p>{TEXTO_SEM_JOGADORES}</p>
            <LinkBotao para={`${base}/jogadores/novo`} variante="principal" bloco>
              Cadastrar jogadores
            </LinkBotao>
          </section>
        ) : null}
        <h2 className={estilos.subtitulo}>Gerenciar</h2>
        <Lista rotulo="Gerenciar">
          <ItemLista titulo="Jogadores" meta={textoJogadores(g.jogadoresAtivos)} para={`${base}/jogadores`} />
          <ItemLista titulo="Habilidades" meta={textoHabilidades(g.habilidades)} para={`${base}/habilidades`} />
          <ItemLista titulo="Admins" meta={textoAdmins(g.admins)} para={`${base}/admins`} />
          <ItemLista titulo="Dados do grupo" meta={`${textoRecorrencia(g)} · link do ranking`} para={`${base}/dados`} />
        </Lista>
      </>
    );
  }

  return (
    <Casca grupo={{ nome, trocarHref: '/app' }} ocupada={grupo.isPending}>
      <h1 className="sr">{`Início do admin: ${nome}`}</h1>
      {conteudo()}
    </Casca>
  );
}
