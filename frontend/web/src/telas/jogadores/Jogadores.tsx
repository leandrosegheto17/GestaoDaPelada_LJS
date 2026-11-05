import type { JogadorItem } from '@pelada/contrato/elenco';
import { chaveBusca, compararApelido } from '@pelada/dominio';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Abas } from '../../componentes/Abas.tsx';
import { Busca } from '../../componentes/Busca.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { FaixaSomenteLeitura } from '../../componentes/FaixaSomenteLeitura.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ItemLista, Lista } from '../../componentes/Lista.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { useJogadores } from '../../dados/elenco.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { exibirNivel, TEXTO_SEM_NOTA } from '../../dados/habilidades.ts';
import { useEmSomenteLeitura } from '../../dados/somente-leitura.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import { ROTULOS_POSICAO } from './posicoes.ts';

/**
 * Jogadores (`/app/grupos/:grupoId/jogadores`, t15; GEL-46 a GEL-49, GEL-103, GEL-114), de
 * `.specs/mockup/telas/t15-jogadores--{sucesso,vazio,vazio-inativos}.html`:
 * - abas "Ativos (N)" e "Inativos (N)" (`Abas`, T57), cada lista na ordem do apelido sem acento e
 *   sem caixa (`compararApelido`, GEL-47);
 * - a busca filtra pelo apelido sem acento e sem caixa (`chaveBusca`, GEL-48); só aparece com
 *   jogadores na aba;
 * - cada jogador com a posição e o nível ("Atacante · nível 6,8"); sem nota, o selo "sem nota"
 *   (GEL-103);
 * - ativos vazios: "Nenhum jogador cadastrado." com "Novo jogador"; inativos vazios: "Nenhum
 *   jogador inativo." (GEL-49). "Novo jogador" fica na barra de ação quando há ativos;
 * - somente leitura (planos-e-cobranca T48; PLA-22): a faixa no topo e "Novo jogador" desabilitado; a lista e a busca
 *   continuam (nada é escondido, PLA-18).
 */

export const TEXTO_SEM_ATIVOS = 'Nenhum jogador cadastrado.';
export const TEXTO_SEM_INATIVOS = 'Nenhum jogador inativo.';
export const TEXTO_BUSCA_VAZIA = 'Nenhum jogador encontrado.';

type Aba = 'ativos' | 'inativos';

export function filtrarJogadores(
  jogadores: readonly JogadorItem[],
  situacao: 'ativo' | 'inativo',
  busca: string,
): JogadorItem[] {
  const chave = chaveBusca(busca.trim());
  return jogadores
    .filter(
      (j) => j.situacao === situacao && (chave === '' || chaveBusca(j.apelido).includes(chave)),
    )
    .sort((a, b) => compararApelido(a.apelido, b.apelido));
}

export function Jogadores() {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const lista = useJogadores(grupoId);
  const [aba, setAba] = useState<Aba>('ativos');
  const [busca, setBusca] = useState('');
  const base = rotaDoGrupo(grupoId);
  const novo = `${base}/jogadores/novo`;
  const somenteLeitura = useEmSomenteLeitura(grupoId);

  function conteudo() {
    if (lista.isPending) return <EsqueletoLista />;
    if (lista.isError) {
      if (lista.error instanceof ErroApi && lista.error.status === 404) {
        return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      }
      return <EstadoErro aoTentarDeNovo={() => void lista.refetch()} />;
    }
    const todos = lista.data.jogadores;
    const totalAtivos = todos.filter((j) => j.situacao === 'ativo').length;
    const totalInativos = todos.length - totalAtivos;
    const situacao = aba === 'ativos' ? 'ativo' : 'inativo';
    const totalDaAba = aba === 'ativos' ? totalAtivos : totalInativos;
    const visiveis = filtrarJogadores(todos, situacao, busca);

    return (
      <>
        <Abas
          id="filtro"
          rotulo="Mostrar"
          idPainel="painel-jogadores"
          abas={[
            { chave: 'ativos', rotulo: 'Ativos', contagem: totalAtivos },
            { chave: 'inativos', rotulo: 'Inativos', contagem: totalInativos },
          ]}
          ativa={aba}
          aoMudar={setAba}
        />
        <div id="painel-jogadores" role="tabpanel" aria-labelledby={`filtro-${aba}`}>
          {totalDaAba === 0 ? (
            <div className={`${estilos.vazio} ${estilos['acima-4']}`}>
              <h2 className={estilos['vazio__titulo']}>
                {aba === 'ativos' ? TEXTO_SEM_ATIVOS : TEXTO_SEM_INATIVOS}
              </h2>
              {aba === 'ativos' ? (
                <LinkBotao para={novo} variante="principal" desabilitado={somenteLeitura}>
                  Novo jogador
                </LinkBotao>
              ) : null}
            </div>
          ) : (
            <>
              <Busca id="busca" rotulo="Buscar jogador" valor={busca} aoMudar={setBusca} />
              {visiveis.length === 0 ? (
                <p className={estilos.paragrafo}>{TEXTO_BUSCA_VAZIA}</p>
              ) : (
                <Lista rotulo={aba === 'ativos' ? 'Jogadores ativos' : 'Jogadores inativos'}>
                  {visiveis.map((j) => (
                    <ItemLista
                      key={j.id}
                      titulo={j.apelido}
                      meta={
                        j.semNota
                          ? ROTULOS_POSICAO[j.posicao]
                          : `${ROTULOS_POSICAO[j.posicao]} · nível ${exibirNivel(j.nivel, false)}`
                      }
                      lateral={
                        j.semNota ? (
                          <span className={`${estilos.selo} ${estilos['selo--atencao']}`}>
                            {TEXTO_SEM_NOTA}
                          </span>
                        ) : undefined
                      }
                      para={`${base}/jogadores/${encodeURIComponent(j.id)}`}
                      seta
                    />
                  ))}
                </Lista>
              )}
            </>
          )}
        </div>
        {totalAtivos > 0 ? (
          <>
            <div className={modulo['reserva-barra']} aria-hidden="true" />
            <div className={modulo['barra-acao']}>
              <LinkBotao para={novo} variante="principal" desabilitado={somenteLeitura}>
                Novo jogador
              </LinkBotao>
            </div>
          </>
        ) : null}
      </>
    );
  }

  return (
    <Casca
      grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }}
      ocupada={lista.isPending}
    >
      <LinkVoltar para={base}>Início</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Jogadores</h1>
      <FaixaSomenteLeitura grupoId={grupoId} />
      {conteudo()}
    </Casca>
  );
}
