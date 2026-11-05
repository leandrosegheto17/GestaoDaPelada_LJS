import type { RankingPublico } from '@pelada/contrato/publico';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import casca from '../../componentes/Casca.module.css';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { Marca } from '../../componentes/Marca.tsx';
import { TelaMensagem } from '../../componentes/TelaMensagem.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { useMesDaUrl, useRankingPublico } from '../../dados/publico.ts';
import estilos from '../acesso.module.css';
import { nomeDoMes } from '../financeiro/FinanceiroMes.tsx';
import { textoRecorrencia } from '../grupos/recorrencia.ts';
import pagina from './ranking.module.css';
import { TabelaRanking } from './TabelaRanking.tsx';

/**
 * Ranking público (`/g/:slug[?mes=AAAA-MM]`, t01; partidas-e-ranking T56; PAR-79, PAR-81, PAR-82, PAR-88, PAR-89,
 * PAR-161), de `.specs/mockup/telas/t01-ranking--{sucesso,vazio,vazio-mes,carregando,erro}.html`:
 * - cabeçalho com o nome do grupo, a agenda ("Toda quinta · 20:00") e só o acesso à área do admin: o atalho
 *   "Financeiro" do mockup fica de fora (PAR-161);
 * - mês exibido com "Mês anterior" e "Mês seguinte", desabilitados quando a API devolve nulo, que trocam o `?mes=`
 *   por substituição (PAR-89, `useMesDaUrl`);
 * - "Exportar PDF" (a geração é da T70), o resumo "N partidas no mês, M com chuva. Ordem pelos pontos acumulados até
 *   hoje.", a tabela (`TabelaRanking`) e a legenda;
 * - mês sem partidas: a tabela com "Nenhuma partida registrada neste mês" (PAR-88);
 * - sem jogadores: "Nenhum jogador no ranking ainda." (PAR-81); carregando: "Carregando o ranking…" (PAR-82);
 * - 422 do mês (fora do histórico ou malformado; P17 de `BC:29`): volta ao mês de hoje tirando o `?mes=` por
 *   substituição e mostra a faixa de erro com a mensagem da API;
 * - falha de rede: "Sem conexão" com "Tentar de novo" (t01 erro).
 * O 404 e o slug malformado (t03) são da T57.
 */

export const TEXTO_SEM_JOGADORES = 'Nenhum jogador no ranking ainda.';
export const TEXTO_SEM_JOGADORES_AJUDA = 'Quando o admin cadastrar os jogadores, o ranking aparece aqui.';
export const TEXTO_CARREGANDO = 'Carregando o ranking…';
export const TEXTO_SEM_CONEXAO = 'Sem conexão';
export const TEXTO_SEM_CONEXAO_AJUDA = 'Conecte-se para ver o ranking.';
export const TEXTO_ORDEM = 'Ordem pelos pontos acumulados até hoje.';

/** "1 partida", "3 partidas". */
export function partidas(n: number): string {
  return n === 1 ? '1 partida' : `${n} partidas`;
}

/** "outubro" de `2026-10`. */
export function nomeCurtoDoMes(mes: string): string {
  return nomeDoMes(mes).split(' de ')[0] ?? mes;
}

function Seta({ direcao }: { direcao: 'anterior' | 'seguinte' }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points={direcao === 'anterior' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}

function IconeExportar() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function IconeEngrenagem() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconeTempo({ choveu }: { choveu: boolean }) {
  return choveu ? (
    <svg className={pagina['icone-chuva']} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
      <path d="M8 13v2M8 19v2M12 15v2M12 21v2M16 13v2M16 19v2" />
    </svg>
  ) : (
    <svg className={pagina['icone-sol']} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function Cabecalho({ dados }: { dados: RankingPublico | undefined }) {
  return (
    <>
      <a className={pagina.pular} href="#conteudo">
        Pular para o ranking
      </a>
      <header className={casca.barra}>
        <div>
          <h1 className={casca['barra__titulo']}>{dados?.grupo.nome ?? 'Ranking'}</h1>
          {dados ? <p className={pagina['barra__sub']}>{textoRecorrencia(dados.grupo)}</p> : null}
        </div>
        <nav className={casca['barra__acoes']} aria-label="Acesso dos admins">
          <a className={casca['botao-icone']} href="/app" aria-label="Área do admin">
            <IconeEngrenagem />
          </a>
        </nav>
      </header>
    </>
  );
}

function NavegacaoMes({ dados, aoIr }: { dados: RankingPublico; aoIr: (mes: string) => void }) {
  const { mesAnterior, mesSeguinte } = dados.navegacao;
  return (
    <nav className={pagina.mes} aria-label="Mês exibido">
      <button
        className={pagina['mes__botao']}
        type="button"
        aria-label={mesAnterior ? `Mês anterior, ${nomeDoMes(mesAnterior)}` : 'Mês anterior'}
        disabled={mesAnterior === null}
        onClick={() => mesAnterior && aoIr(mesAnterior)}
      >
        <Seta direcao="anterior" />
      </button>
      <h2 className={pagina['mes__rotulo']} aria-live="polite">
        {nomeDoMes(dados.mes)}
      </h2>
      <button
        className={pagina['mes__botao']}
        type="button"
        aria-label={mesSeguinte ? `Mês seguinte, ${nomeDoMes(mesSeguinte)}` : 'Mês seguinte'}
        disabled={mesSeguinte === null}
        onClick={() => mesSeguinte && aoIr(mesSeguinte)}
      >
        <Seta direcao="seguinte" />
      </button>
    </nav>
  );
}

function Legenda() {
  return (
    <section className={pagina.legenda} aria-labelledby="titulo-legenda">
      <h2 id="titulo-legenda" className={pagina['legenda__titulo']}>
        Legenda
      </h2>
      <p className={pagina['legenda__explica']}>
        A cor mostra a situação; o número, os pontos da rodada. Pts inicial + rodadas do mês = Pts final.
      </p>
      <ul>
        <li>
          <Marca situacao="presente" valor={1} />
          Presente
        </li>
        <li>
          <Marca situacao="lesionado" valor={1} />
          Lesionado (foi e não jogou)
        </li>
        <li>
          <Marca situacao="expulso" valor="−1" />
          Expulso
        </li>
        <li>
          <Marca situacao="falta" valor={0} />
          Falta
        </li>
        <li>
          <Marca situacao="sem" valor="–" />
          Fora do grupo ou antes da data de início
        </li>
        <li>
          <IconeTempo choveu={false} />
          Jogo sem chuva
        </li>
        <li>
          <IconeTempo choveu />
          Jogo com chuva
        </li>
      </ul>
    </section>
  );
}

function Rodape() {
  return (
    <footer className={pagina.rodape}>
      <a href="/privacidade">Privacidade</a> · Gestão da Pelada
    </footer>
  );
}

function BotaoExportar({ classe }: { classe?: string }) {
  // A geração do PDF e o aviso Pro entram na T70; aqui só o botão do mockup.
  return (
    <span className={classe}>
      <Botao variante="principal">
        <IconeExportar />
        Exportar PDF
      </Botao>
    </span>
  );
}

function Ranking({ dados, aoIr }: { dados: RankingPublico; aoIr: (mes: string) => void }) {
  if (dados.linhas.length === 0) {
    return (
      <>
        <div className={pagina.ferramentas}>
          <NavegacaoMes dados={dados} aoIr={aoIr} />
        </div>
        <div className={estilos.vazio}>
          <h2 className={estilos['vazio__titulo']}>{TEXTO_SEM_JOGADORES}</h2>
          <p className={estilos['vazio__texto']}>{TEXTO_SEM_JOGADORES_AJUDA}</p>
        </div>
      </>
    );
  }
  const semPartidas = dados.partidas.length === 0;
  const legenda = semPartidas
    ? `Ranking geral da ${dados.grupo.nome}; ${nomeDoMes(dados.mes)} não tem partidas`
    : `Ranking geral da ${dados.grupo.nome}, com os pontos de cada partida de ${nomeDoMes(dados.mes)}`;
  return (
    <>
      <div className={pagina.ferramentas}>
        <NavegacaoMes dados={dados} aoIr={aoIr} />
        <BotaoExportar classe={pagina.topo} />
      </div>
      <p className={pagina['resumo-mes']}>
        {semPartidas ? (
          TEXTO_ORDEM
        ) : (
          <>
            <strong>{partidas(dados.resumoMes.partidas)}</strong> no mês, {dados.resumoMes.comChuva} com chuva. {TEXTO_ORDEM}
          </>
        )}
      </p>
      <TabelaRanking partidas={dados.partidas} linhas={dados.linhas} legenda={legenda} nomeMes={nomeCurtoDoMes(dados.mes)} />
      {semPartidas ? null : <Legenda />}
    </>
  );
}

export function PaginaRanking() {
  const { slug = '' } = useParams();
  const [mes, trocarMes] = useMesDaUrl();
  const consulta = useRankingPublico(slug, mes);
  const [aviso, setAviso] = useState<string | null>(null);

  const erro = consulta.error;
  const mesRecusado = erro instanceof ErroApi && erro.status === 422 && mes !== undefined;

  // P17: mês fora do histórico (ou malformado) volta ao mês de hoje, sem entrada nova na história, com a faixa.
  useEffect(() => {
    if (mesRecusado) {
      setAviso(erro?.message ?? null);
      trocarMes(null);
    }
  }, [mesRecusado, erro, trocarMes]);

  const aoIr = (novo: string) => {
    setAviso(null);
    trocarMes(novo);
  };

  if (consulta.isError && !mesRecusado) {
    return (
      <>
        <Cabecalho dados={undefined} />
        <main className={casca['tela-mensagem']}>
          <TelaMensagem
            icone="erro"
            titulo={TEXTO_SEM_CONEXAO}
            acao={
              <Botao variante="secundario" onClick={() => void consulta.refetch()}>
                Tentar de novo
              </Botao>
            }
          >
            <span role="alert">{TEXTO_SEM_CONEXAO_AJUDA}</span>
          </TelaMensagem>
        </main>
      </>
    );
  }

  const dados = consulta.data;
  return (
    <>
      <Cabecalho dados={dados} />
      <main id="conteudo" className={casca.conteudo} aria-busy={dados ? undefined : true}>
        {aviso ? <Faixa tipo="erro">{aviso}</Faixa> : null}
        {dados ? <Ranking dados={dados} aoIr={aoIr} /> : <EsqueletoLista rotulo={TEXTO_CARREGANDO} />}
        {dados ? <Rodape /> : null}
      </main>
      {dados && dados.linhas.length > 0 ? (
        <div className={pagina['barra-celular']}>
          <BotaoExportar />
        </div>
      ) : null}
    </>
  );
}
