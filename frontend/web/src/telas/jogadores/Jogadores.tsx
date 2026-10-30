import type { JogadorItem } from '@pelada/contrato';
import { useState } from 'react';
import { useParams } from 'react-router';
import { BarraAcao } from '../../componentes/barras/BarraAcao';
import { BotaoLink } from '../../componentes/basicos/BotaoLink';
import { ErroRede } from '../../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../../componentes/basicos/Esqueleto';
import { EstadoVazio } from '../../componentes/basicos/EstadoVazio';
import { Selo } from '../../componentes/basicos/Selo';
import { CampoBusca } from '../../componentes/campos/CampoBusca';
import { Segmentado } from '../../componentes/escolhas/Segmentado';
import { Item } from '../../componentes/listas/Item';
import { Lista } from '../../componentes/listas/Lista';
import { useJogadores } from '../../dados/elenco';
import { useGrupo } from '../../dados/grupos';
import { formatarNivel } from '../../dados/notas';
import { chaveBusca, compararApelido } from '../../formatacao';
import { ROTULO_POSICAO } from '../../rotulos';
import { PaginaInterna } from '../compartilhado/PaginaInterna';

type Filtro = 'ativo' | 'inativo';

const meta = (j: JogadorItem) =>
  j.semNota ? ROTULO_POSICAO[j.posicao] : `${ROTULO_POSICAO[j.posicao]} · nível ${formatarNivel(j.nivel)}`;

/**
 * `/app/grupos/:grupoId/jogadores` (t15): Ativos e Inativos com a contagem, busca sem acento e sem caixa, listas
 * ordenadas por apelido (GEL-46 a GEL-49). Sem ativos, o estado vazio leva ao cadastro; sem inativos, só o texto.
 */
export function Jogadores() {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const jogadores = useJogadores(grupoId);
  const [filtro, setFiltro] = useState<Filtro>('ativo');
  const [busca, setBusca] = useState('');
  const todos = jogadores.data?.jogadores;
  const base = `/app/grupos/${grupoId}`;

  const ativos = todos?.filter((j) => j.situacao === 'ativo') ?? [];
  const inativos = todos?.filter((j) => j.situacao === 'inativo') ?? [];
  const chave = chaveBusca(busca.trim());
  const visiveis = (filtro === 'ativo' ? ativos : inativos)
    .filter((j) => chaveBusca(j.apelido).includes(chave))
    .sort(compararApelido);
  const totalDoFiltro = filtro === 'ativo' ? ativos.length : inativos.length;

  return (
    <PaginaInterna
      titulo="Jogadores"
      {...(grupo.data ? { nomeGrupo: grupo.data.nome } : {})}
      destinoTrocarGrupo="/app"
      voltarPara={base}
      voltarRotulo="Início"
      ocupado={jogadores.isPending}
    >
      {jogadores.isPending ? (
        <>
          <p className="sr" role="status">
            Carregando…
          </p>
          <FormaEsqueleto variante="linha" quantidade={5} />
        </>
      ) : null}
      {jogadores.isError ? <ErroRede aoTentar={() => void jogadores.refetch()} /> : null}
      {todos ? (
        <>
          <Segmentado
            legenda="Mostrar"
            opcoes={[
              { valor: 'ativo', rotulo: `Ativos (${ativos.length})` },
              { valor: 'inativo', rotulo: `Inativos (${inativos.length})` },
            ]}
            valor={filtro}
            aoMudar={setFiltro}
          />
          {totalDoFiltro > 0 ? <CampoBusca rotulo="Buscar jogador" valor={busca} aoMudar={setBusca} /> : null}
          {totalDoFiltro === 0 ? (
            filtro === 'ativo' ? (
              <EstadoVazio
                icone={null}
                titulo="Nenhum jogador cadastrado."
                acao={<BotaoLink to={`${base}/jogadores/novo`}>Novo jogador</BotaoLink>}
              />
            ) : (
              <EstadoVazio icone={null} titulo="Nenhum jogador inativo." />
            )
          ) : (
            <Lista>
              {visiveis.map((j) => (
                <Item
                  key={j.id}
                  titulo={j.apelido}
                  meta={meta(j)}
                  para={`${base}/jogadores/${j.id}`}
                  {...(j.semNota ? { lado: <Selo tom="atencao">sem nota</Selo> } : {})}
                />
              ))}
            </Lista>
          )}
          {totalDoFiltro > 0 || filtro === 'inativo' ? (
            <BarraAcao>
              <BotaoLink to={`${base}/jogadores/novo`}>Novo jogador</BotaoLink>
            </BarraAcao>
          ) : null}
        </>
      ) : null}
    </PaginaInterna>
  );
}
