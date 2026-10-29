import { useParams } from 'react-router';
import { BotaoLink } from '../../componentes/basicos/BotaoLink';
import { ErroRede } from '../../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../../componentes/basicos/Esqueleto';
import { Item } from '../../componentes/listas/Item';
import { Lista } from '../../componentes/listas/Lista';
import { useJogadores } from '../../dados/elenco';
import { useGrupo } from '../../dados/grupos';
import { descreverAgenda } from '../../formatacao';
import { PaginaInterna } from '../compartilhado/PaginaInterna';
import estilos from './InicioDoGrupo.module.css';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * `/app/grupos/:grupoId` (t09): o resumo do grupo e os atalhos para jogadores, habilidades, admins e dados do grupo
 * (GEL-20, GEL-114). Sem o item "Pontuação" até a `partidas-e-ranking` (C6).
 * SPEC_DEVIATION: o mockup t09 também mostra Partidas, Uso do app, Financeiro e, com jogadores, os botões de lançar
 * partida e do simulador; essas telas são de features seguintes e entram com elas. Daqui fica o "Dia de jogo" do
 * grupo sem jogadores, que leva ao cadastro.
 */
export function InicioDoGrupo() {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const jogadores = useJogadores(grupoId);
  const base = `/app/grupos/${grupoId}`;
  const g = grupo.data;
  const cadastrados = jogadores.data?.jogadores.length;

  let metaJogadores: string | undefined;
  if (cadastrados === 0) metaJogadores = 'Nenhum cadastrado';
  else if (g && g.jogadoresAtivos === 0) metaJogadores = 'Nenhum ativo';
  else if (g) metaJogadores = plural(g.jogadoresAtivos, 'ativo', 'ativos');

  return (
    <PaginaInterna
      titulo={g ? `Início do admin: ${g.nome}` : 'Início do admin'}
      tituloOculto
      largo
      comMenu
      {...(g ? { nomeGrupo: g.nome, destinoRanking: `/g/${g.slug}` } : {})}
      destinoTrocarGrupo="/app"
      ocupado={grupo.isPending}
    >
      {grupo.isPending ? (
        <>
          <p className="sr" role="status">
            Carregando…
          </p>
          <FormaEsqueleto variante="bloco" quantidade={4} />
        </>
      ) : null}
      {grupo.isError ? <ErroRede aoTentar={() => void grupo.refetch()} /> : null}
      {g ? (
        <>
          {cadastrados === 0 ? (
            <section className={estilos.diaDeJogo} aria-labelledby="dia-de-jogo">
              <h2 id="dia-de-jogo" className={estilos.titulo}>
                Dia de jogo
              </h2>
              <p>Cadastre os jogadores para lançar partidas.</p>
              <BotaoLink to={`${base}/jogadores/novo`} bloco>
                Cadastrar jogadores
              </BotaoLink>
            </section>
          ) : null}
          <h2 className="subtitulo">Gerenciar</h2>
          <Lista>
            <Item titulo="Jogadores" meta={metaJogadores} para={`${base}/jogadores`} />
            <Item
              titulo="Habilidades"
              meta={g.habilidades === 0 ? 'Nenhuma' : plural(g.habilidades, 'habilidade', 'habilidades')}
              para={`${base}/habilidades`}
            />
            <Item titulo="Admins" meta={plural(g.admins, 'admin', 'admins')} para={`${base}/admins`} />
            <Item titulo="Dados do grupo" meta={`${descreverAgenda(g)} · link do ranking`} para={`${base}/dados`} />
          </Lista>
        </>
      ) : null}
    </PaginaInterna>
  );
}
