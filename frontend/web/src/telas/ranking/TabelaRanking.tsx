import type { LinhaPublica, RodadaPublica, SituacaoRodada } from '@pelada/contrato/publico';
import { Marca, type Situacao } from '../../componentes/Marca.tsx';
import estilos from './TabelaRanking.module.css';

/**
 * Tabela do ranking público (partidas-e-ranking T55; PAR-79, PAR-80), no molde de
 * `.specs/mockup/telas/t01-ranking--sucesso.html:33-67`: "#", "Jogador", "Pts inicial", uma coluna por partida
 * ("dd/mm" com o ícone de sol ou de chuva e ", sem chuva"/", com chuva" para leitor de tela) e "Pts final".
 *
 * Cada rodada usa a `Marca` do guia: o número de pontos, a pista que não é só cor (cheio, letra de canto L/E,
 * contorno tracejado da falta, "–" sem fundo; `base.css:192`) e o texto acessível de PAR-80. Os pontos negativos
 * aparecem com o sinal de menos tipográfico ("−1") e são lidos "menos 1 ponto".
 *
 * O mês sem partidas (PAR-88) e os estados da página são da `PaginaRanking` (T56).
 */

export const TEXTO_FORA = 'Fora do grupo ou antes da data de início';

const SITUACAO_MARCA: Record<SituacaoRodada, Situacao> = {
  presente: 'presente',
  lesionado: 'lesionado',
  expulso: 'expulso',
  falta: 'falta',
  fora: 'sem',
};

const NOME_SITUACAO: Record<Exclude<SituacaoRodada, 'fora'>, string> = {
  presente: 'Presente',
  lesionado: 'Lesionado',
  expulso: 'Expulso',
  falta: 'Falta',
};

/** "1 ponto", "0 pontos", "2 pontos", "menos 1 ponto", "menos 2 pontos". */
export function textoPontos(pontos: number): string {
  const absoluto = Math.abs(pontos);
  const unidade = absoluto === 1 ? 'ponto' : 'pontos';
  return `${pontos < 0 ? 'menos ' : ''}${absoluto} ${unidade}`;
}

/** Texto acessível da rodada (PAR-80): "Presente, 1 ponto", "Expulso, menos 1 ponto", "Falta, 0 pontos" ou o do "–". */
export function textoRodada(rodada: RodadaPublica): string {
  if (rodada.situacao === 'fora' || rodada.pontos === null) return TEXTO_FORA;
  return `${NOME_SITUACAO[rodada.situacao]}, ${textoPontos(rodada.pontos)}`;
}

/** Número que aparece na marca: "–" para fora, "−1" (sinal tipográfico) para negativo. */
export function valorRodada(rodada: RodadaPublica): string {
  if (rodada.situacao === 'fora' || rodada.pontos === null) return '–';
  return rodada.pontos < 0 ? `−${Math.abs(rodada.pontos)}` : String(rodada.pontos);
}

/** "2026-10-15" → "15/10". */
export function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

function IconeTempo({ choveu }: { choveu: boolean }) {
  if (choveu) {
    return (
      <svg
        className={`${estilos['icone-tempo']} ${estilos['icone-tempo--chuva']}`}
        data-tempo="chuva"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
        <path d="M8 13v2M8 19v2M12 15v2M12 21v2M16 13v2M16 19v2" />
      </svg>
    );
  }
  return (
    <svg
      className={`${estilos['icone-tempo']} ${estilos['icone-tempo--sol']}`}
      data-tempo="sol"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export interface PropsTabelaRanking {
  partidas: ReadonlyArray<{ data: string; choveu: boolean }>;
  linhas: readonly LinhaPublica[];
  /** Legenda da tabela para leitor de tela (ex.: "Ranking geral da Pelada de Quinta, com os pontos de cada partida de outubro de 2026"). */
  legenda: string;
  /**
   * Nome do mês exibido ("julho"), usado só quando o mês não tem partidas (PAR-88, T56): "Pts inicial (início de
   * julho)", "Pts final (fim de julho)" e "Nenhuma partida registrada neste mês" no lugar das colunas de partida,
   * de `t01-ranking--vazio-mes.html:34-38`.
   */
  nomeMes?: string | undefined;
}

export const TEXTO_MES_SEM_PARTIDAS = 'Nenhuma partida registrada neste mês';

function TabelaMesSemPartidas({
  linhas,
  legenda,
  nomeMes,
}: {
  linhas: readonly LinhaPublica[];
  legenda: string;
  nomeMes: string;
}) {
  return (
    <div
      className={estilos['tabela-rolagem']}
      role="region"
      aria-label="Tabela do ranking"
      tabIndex={0}
    >
      <table className={estilos.ranking}>
        <caption className="sr">{legenda}</caption>
        <thead>
          <tr>
            <th scope="col" className={estilos['c-pos']}>
              <abbr title="Posição">#</abbr>
            </th>
            <th scope="col" className={estilos['c-nome']}>
              Jogador
            </th>
            <th scope="col" className={estilos['c-pts']}>
              Pts inicial<span className="sr"> (início de {nomeMes})</span>
            </th>
            <th scope="col">Partidas do mês</th>
            <th scope="col" className={estilos['c-pts']}>
              Pts final<span className="sr"> (fim de {nomeMes})</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={`${linha.posicao}-${linha.apelido}`}>
              <td className={estilos['c-pos']}>{linha.posicao}</td>
              <th scope="row" className={estilos['c-nome']}>
                {linha.apelido}
              </th>
              <td className={`${estilos['c-pts']} ${estilos['c-pts--inicial']}`}>
                {linha.ptsInicial}
              </td>
              {i === 0 ? (
                <td className={estilos['ranking__sem-partidas']} rowSpan={linhas.length}>
                  {TEXTO_MES_SEM_PARTIDAS}
                </td>
              ) : null}
              <td className={estilos['c-pts']}>{linha.ptsFinal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TabelaRanking({ partidas, linhas, legenda, nomeMes }: PropsTabelaRanking) {
  if (partidas.length === 0 && nomeMes !== undefined) {
    return <TabelaMesSemPartidas linhas={linhas} legenda={legenda} nomeMes={nomeMes} />;
  }
  return (
    <div
      className={estilos['tabela-rolagem']}
      role="region"
      aria-label="Tabela do ranking (role para o lado para ver as partidas)"
      tabIndex={0}
    >
      <table className={estilos.ranking}>
        <caption className="sr">{legenda}</caption>
        <thead>
          <tr>
            <th scope="col" className={estilos['c-pos']}>
              <abbr title="Posição">#</abbr>
            </th>
            <th scope="col" className={estilos['c-nome']}>
              Jogador
            </th>
            <th scope="col" className={estilos['c-pts']}>
              Pts inicial<span className="sr"> (antes das partidas do mês)</span>
            </th>
            {partidas.map((p) => (
              <th key={p.data} scope="col" className={estilos['c-partida']}>
                {diaMes(p.data)}
                <IconeTempo choveu={p.choveu} />
                <span className="sr">{p.choveu ? ', com chuva' : ', sem chuva'}</span>
              </th>
            ))}
            <th scope="col" className={estilos['c-pts']}>
              Pts final<span className="sr"> (acumulado até hoje)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={`${linha.posicao}-${linha.apelido}`}>
              <td className={estilos['c-pos']}>{linha.posicao}</td>
              <th scope="row" className={estilos['c-nome']}>
                {linha.apelido}
              </th>
              <td className={`${estilos['c-pts']} ${estilos['c-pts--inicial']}`}>
                {linha.ptsInicial}
              </td>
              {linha.rodadas.map((rodada, i) => (
                <td key={partidas[i]?.data ?? i} className={estilos['c-partida']}>
                  <Marca
                    situacao={SITUACAO_MARCA[rodada.situacao]}
                    valor={valorRodada(rodada)}
                    rotulo={textoRodada(rodada)}
                  />
                </td>
              ))}
              <td className={estilos['c-pts']}>{linha.ptsFinal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
