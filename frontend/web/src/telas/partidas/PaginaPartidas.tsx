import { DIAS_DA_SEMANA } from '@pelada/contrato/grupo';
import type { ContagemPartida, PartidasDoMes } from '@pelada/contrato/partidas';
import { diaDaSemana } from '@pelada/dominio';
import { useLocation, useParams, useSearchParams } from 'react-router';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { ROTULOS_DIA_SEMANA } from '../../componentes/CampoSeletor.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ItemLista, Lista } from '../../componentes/Lista.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { usePartidasDoMes } from '../../dados/partidas.ts';
import estilos from '../acesso.module.css';
import { nomeDoMes } from '../financeiro/FinanceiroMes.tsx';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import navegacao from '../ranking/ranking.module.css';

/**
 * Partidas do mês (`/app/grupos/:grupoId/partidas[?mes=AAAA-MM]`, t10; partidas-e-ranking T59; PAR-42, PAR-43), de
 * `.specs/mockup/telas/t10-partidas--{sucesso,vazio}.html`:
 * - "Início", título "Partidas" e a navegação do mês ("Mês anterior, <mês>", "Mês seguinte"; desabilitado quando a
 *   API devolve nulo), que troca o `?mes=`;
 * - uma linha por partida, da mais recente para a mais antiga: "Quinta, 15/10/2026" e "15 P · 0 L · 1 E", com o
 *   ícone e "chuva · " antes quando choveu (PAR-42); cada linha abre a edição (`…/partidas/:data`);
 * - mês vazio: "Nenhuma partida neste mês." (PAR-43); "Nova partida" sempre.
 */

export const TEXTO_SEM_PARTIDAS = 'Nenhuma partida neste mês.';

/** "2026-10-15" → "Quinta, 15/10/2026". */
export function tituloDaPartida(data: string): string {
  const [ano, mes, dia] = data.split('-');
  const nome = DIAS_DA_SEMANA[diaDaSemana(data)];
  return `${nome ? ROTULOS_DIA_SEMANA[nome] : ''}, ${dia}/${mes}/${ano}`;
}

/** "15 P · 0 L · 1 E". */
export function textoContagem(c: ContagemPartida): string {
  return `${c.presentes} P · ${c.lesionados} L · ${c.expulsos} E`;
}

function IconeChuva() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
      <path d="M8 13v2M8 19v2M12 15v2M12 21v2M16 13v2M16 19v2" />
    </svg>
  );
}

function Seta({ direcao }: { direcao: 'anterior' | 'seguinte' }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points={direcao === 'anterior' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}

function NavegacaoMes({ dados, aoIr }: { dados: PartidasDoMes; aoIr: (mes: string) => void }) {
  const { mesAnterior, mesSeguinte } = dados.navegacao;
  return (
    <div className={navegacao.ferramentas}>
      <nav className={navegacao.mes} aria-label="Mês exibido">
        <button
          className={navegacao['mes__botao']}
          type="button"
          aria-label={mesAnterior ? `Mês anterior, ${nomeDoMes(mesAnterior)}` : 'Mês anterior'}
          disabled={mesAnterior === null}
          onClick={() => mesAnterior && aoIr(mesAnterior)}
        >
          <Seta direcao="anterior" />
        </button>
        <h2 className={navegacao['mes__rotulo']}>{nomeDoMes(dados.mes)}</h2>
        <button
          className={navegacao['mes__botao']}
          type="button"
          aria-label={mesSeguinte ? `Mês seguinte, ${nomeDoMes(mesSeguinte)}` : 'Mês seguinte'}
          disabled={mesSeguinte === null}
          onClick={() => mesSeguinte && aoIr(mesSeguinte)}
        >
          <Seta direcao="seguinte" />
        </button>
      </nav>
    </div>
  );
}

function Mes({ dados, base, aoIr }: { dados: PartidasDoMes; base: string; aoIr: (mes: string) => void }) {
  return (
    <>
      <NavegacaoMes dados={dados} aoIr={aoIr} />
      {dados.partidas.length === 0 ? (
        <div className={estilos.vazio}>
          <h2 className={estilos['vazio__titulo']}>{TEXTO_SEM_PARTIDAS}</h2>
        </div>
      ) : (
        <Lista rotulo={`Partidas de ${nomeDoMes(dados.mes)}`}>
          {dados.partidas.map((p) => (
            <ItemLista
              key={p.data}
              titulo={tituloDaPartida(p.data)}
              meta={
                p.choveu ? (
                  <>
                    <IconeChuva /> chuva · {textoContagem(p.contagem)}
                  </>
                ) : (
                  textoContagem(p.contagem)
                )
              }
              para={`${base}/partidas/${encodeURIComponent(p.data)}`}
              seta
            />
          ))}
        </Lista>
      )}
    </>
  );
}

export function PaginaPartidas() {
  const { grupoId = '' } = useParams();
  const [busca, setBusca] = useSearchParams();
  const mes = busca.get('mes') ?? undefined;
  const grupo = useGrupo(grupoId);
  const consulta = usePartidasDoMes(grupoId, mes);
  const base = rotaDoGrupo(grupoId);
  // "Partida de dd/mm excluída." e "… salva." (T61; PAR-54): o aviso que a edição manda na navegação.
  const estado = useLocation().state as { aviso?: unknown } | null;
  const aviso = typeof estado?.aviso === 'string' ? estado.aviso : null;

  function conteudo() {
    if (consulta.isPending) return <EsqueletoLista linhas={3} />;
    if (consulta.isError) {
      const erro = consulta.error;
      if (erro instanceof ErroApi && erro.status === 404) return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      // Mês malformado ou futuro no endereço: a mensagem da API e o caminho de volta ao mês atual.
      if (erro instanceof ErroApi && erro.status === 422) {
        return (
          <Faixa tipo="atencao" acao={<LinkBotao para={`${base}/partidas`}>Ir para o mês atual</LinkBotao>}>
            {erro.message}
          </Faixa>
        );
      }
      return <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />;
    }
    return <Mes dados={consulta.data} base={base} aoIr={(m) => setBusca({ mes: m })} />;
  }

  return (
    <Casca grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }} titulo="Partidas" ocupada={consulta.isPending}>
      <LinkVoltar para={base}>Início</LinkVoltar>
      {aviso ? <Faixa tipo="sucesso">{aviso}</Faixa> : null}
      {conteudo()}
      <div className={modulo['reserva-barra']} aria-hidden="true" />
      <div className={modulo['barra-acao']}>
        <LinkBotao para={`${base}/partidas/nova`} variante="principal">
          Nova partida
        </LinkBotao>
      </div>
    </Casca>
  );
}
