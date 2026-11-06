import type { ResultadoDois } from '@pelada/contrato/simulador';
import type { ReactNode } from 'react';
import { exibirNivel } from '../../dados/habilidades.ts';
import { TEXTO_SEM_ANO } from './EntradasSimulador.tsx';
import { IconeAviso } from './IconeAviso.tsx';
import estilos from './simulador.module.css';

/**
 * Resultado em 2 times (t13; simulador T47; SIM-20, SIM-26, SIM-41, SIM-74, SIM-86), de
 * `.specs/mockup/telas/t13-resultado-dois--{sucesso,carregando}.html`:
 * - cabeçalho "<dia abreviado>, dd/mm · 2 times de N · até K substituições por time", ou "sem limite de
 *   substituições" com K ilimitado (SIM-74);
 * - avisos da API, sem bloquear (SIM-46);
 * - "Comparação entre os times": nível no 1º e no 2º tempo (soma · média), idade média e substituições, com uma casa
 *   decimal (SIM-41); média nula (ninguém no tempo, ou ninguém com ano) vira "—";
 * - por time: "Titulares" com "só 1º tempo" e "sai no intervalo", "Entram no 2º tempo" e "Trocas no intervalo"
 *   ("A → B"); à parte, "Não entra" com "Compareceram e recebem a pontuação de presença." (SIM-26);
 * - "Ordem de prioridade" com os apelidos na ordem da API (SIM-20); o `avaliar` não a devolve e ela some.
 * Cada jogador é um botão que abre a folha de mover (T49).
 */

export const TEXTO_NAO_ENTRA_NOTA = 'Compareceram e recebem a pontuação de presença.';
export const TEXTO_MONTANDO = 'Montando os times…';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** "2026-10-22" → "qui, 22/10". */
export function diaAbreviado(data: string): string {
  const [ano, mes, dia] = data.split('-').map((p) => Number.parseInt(p, 10));
  const semana = new Date(Date.UTC(ano ?? 0, (mes ?? 1) - 1, dia ?? 1)).getUTCDay();
  return `${DIAS[semana]}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

/**
 * Cabeçalho de 2 times (SIM-74).
 * [LACUNA] a spec escreve "até K substituições" sem o singular; com K = 1 o rascunho mantém o texto da spec.
 */
export function cabecalhoDois(data: string, n: number, k: number | 'ilimitado'): string {
  const limite =
    k === 'ilimitado' ? 'sem limite de substituições' : `até ${k} substituições por time`;
  return `${diaAbreviado(data)} · 2 times de ${n} · ${limite}`;
}

/** Valor × 100 com uma casa decimal e vírgula (6845 → "68,5"); nulo vira "—". */
export function umaCasa(valor: number | null): string {
  return valor === null ? '—' : exibirNivel(valor, false);
}

export type ResultadoDoisNaTela = Omit<ResultadoDois, 'ordemPrioridade'> & {
  ordemPrioridade?: string[] | undefined;
};

type JogadorDaTela =
  | ResultadoDois['times'][number]['titulares'][number]
  | ResultadoDois['times'][number]['entramNo2oTempo'][number];

interface PropsResultadoDois {
  resultado: ResultadoDoisNaTela;
  /** Os números estão sendo recalculados (T49). */
  recalculando?: boolean | undefined;
  /** Toque num jogador (abre a folha de mover, T49). */
  aoTocarJogador?: (id: string) => void;
  /** Ids movidos à mão, destacados (T49). */
  movidos?: ReadonlySet<string> | undefined;
  /** Faixa de falha do recálculo e as ações (T49, T50). */
  antes?: ReactNode | undefined;
  acoes?: ReactNode | undefined;
}

function Selos({ j }: { j: JogadorDaTela & { saiNoIntervalo?: boolean } }) {
  const selos: ReactNode[] = [];
  if (j.so1oTempo)
    selos.push(
      <span key="so1o" className={`${estilos.selo} ${estilos['selo--info']}`}>
        só 1º tempo
      </span>,
    );
  if (j.saiNoIntervalo)
    selos.push(
      <span key="sai" className={`${estilos.selo} ${estilos['selo--atencao']}`}>
        sai no intervalo
      </span>,
    );
  if (j.semNota)
    selos.push(
      <span key="nota" className={`${estilos.selo} ${estilos['selo--atencao']}`}>
        sem nota
      </span>,
    );
  if (j.semAno)
    selos.push(
      <span key="ano" className={`${estilos.selo} ${estilos['selo--neutro']}`}>
        {TEXTO_SEM_ANO}
      </span>,
    );
  return selos.length > 0 ? <span className={estilos['jogador-time__selos']}>{selos}</span> : null;
}

export function ListaJogadores({
  jogadores,
  aoTocar,
  movidos,
  classeExtra,
}: {
  jogadores: ReadonlyArray<JogadorDaTela & { saiNoIntervalo?: boolean }>;
  aoTocar?: ((id: string) => void) | undefined;
  movidos?: ReadonlySet<string> | undefined;
  classeExtra?: string | undefined;
}) {
  return (
    <ul className={[estilos['jogadores-time'], classeExtra].filter(Boolean).join(' ')}>
      {jogadores.map((j) => (
        <li key={j.id}>
          <button
            className={[
              estilos['jogador-time'],
              movidos?.has(j.id) ? estilos['jogador-time--movido'] : '',
            ]
              .filter(Boolean)
              .join(' ')}
            type="button"
            aria-haspopup="dialog"
            onClick={() => aoTocar?.(j.id)}
          >
            <span>{j.apelido}</span>
            <Selos j={j} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Esqueleto do "Montando os times…" (t13 `carregando`, vale para a t14; SIM-86). */
export function MontandoTimes() {
  return (
    <div aria-busy="true">
      <p className="sr" role="status">
        {TEXTO_MONTANDO}
      </p>
      <div className={`${estilos.times} ${estilos['times--dois']}`} aria-hidden="true">
        {['a', 'b'].map((t) => (
          <div
            key={t}
            className={[estilos['cartao-time'], t === 'b' ? estilos['cartao-time--b'] : '']
              .filter(Boolean)
              .join(' ')}
          >
            <span className={`${estilos.esqueleto} ${estilos['esqueleto--titulo']}`} />
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`${estilos.esqueleto} ${estilos['esqueleto--linha']}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResultadoDoisTimes({
  resultado,
  recalculando = false,
  aoTocarJogador,
  movidos,
  antes,
  acoes,
}: PropsResultadoDois) {
  const apelidos = new Map<string, string>();
  for (const t of resultado.times)
    for (const j of [...t.titulares, ...t.entramNo2oTempo]) apelidos.set(j.id, j.apelido);
  for (const j of resultado.naoEntra) apelidos.set(j.id, j.apelido);
  const apelido = (id: string) => apelidos.get(id) ?? id;
  const [a, b] = resultado.times;
  const numero = (v: string) =>
    recalculando ? <span className={estilos.recalculando}>recalculando…</span> : v;

  return (
    <>
      <p className={`${estilos.paragrafo} ${estilos['texto-sec']}`}>
        {cabecalhoDois(resultado.data, resultado.n, resultado.k)}
      </p>
      {antes}
      {resultado.avisos.length > 0 ? (
        <div role="status">
          <ul className={estilos.avisos}>
            {resultado.avisos.map((av) => (
              <li key={`${av.tipo}-${av.texto}`}>
                <IconeAviso />
                {av.texto}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <table className={estilos.comparativo} aria-busy={recalculando || undefined}>
        <caption className="sr">Comparação entre os times</caption>
        <thead>
          <tr>
            <td />
            <th scope="col">{a.nome}</th>
            <th scope="col">{b.nome}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Nível no 1º tempo (soma · média)</th>
            {[a, b].map((t) => (
              <td key={t.nome}>
                {numero(
                  `${umaCasa(t.indicadores.nivelSoma1oTempo)} · ${umaCasa(t.indicadores.nivelMedio1oTempo)}`,
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Nível no 2º tempo (soma · média)</th>
            {[a, b].map((t) => (
              <td key={t.nome}>
                {numero(
                  `${umaCasa(t.indicadores.nivelSoma2oTempo)} · ${umaCasa(t.indicadores.nivelMedio2oTempo)}`,
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Idade média</th>
            {[a, b].map((t) => (
              <td key={t.nome}>{numero(umaCasa(t.indicadores.idadeMedia))}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Substituições</th>
            {[a, b].map((t) => (
              <td key={t.nome}>{numero(String(t.indicadores.substituicoes))}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className={`${estilos.times} ${estilos['times--dois']}`}>
        {[a, b].map((t, i) => {
          const idTitulo = `time-${i === 0 ? 'a' : 'b'}`;
          return (
            <section
              key={t.nome}
              className={[estilos['cartao-time'], i === 1 ? estilos['cartao-time--b'] : '']
                .filter(Boolean)
                .join(' ')}
              aria-labelledby={idTitulo}
            >
              <h2 id={idTitulo} className={estilos['cartao-time__titulo']}>
                {t.nome}
              </h2>
              <h3 className={estilos['cartao-time__grupo']}>Titulares</h3>
              <ListaJogadores jogadores={t.titulares} aoTocar={aoTocarJogador} movidos={movidos} />
              {t.entramNo2oTempo.length > 0 ? (
                <>
                  <h3 className={estilos['cartao-time__grupo']}>Entram no 2º tempo</h3>
                  <ListaJogadores
                    jogadores={t.entramNo2oTempo}
                    aoTocar={aoTocarJogador}
                    movidos={movidos}
                  />
                </>
              ) : null}
              {t.trocas.length > 0 || t.saiSemPar.length > 0 || t.entraSemPar.length > 0 ? (
                <>
                  <h3 className={estilos['cartao-time__grupo']}>Trocas no intervalo</h3>
                  <ul className={estilos.pares}>
                    {t.trocas.map((tr) => (
                      <li
                        key={`${tr.sai}-${tr.entra}`}
                      >{`${apelido(tr.sai)} → ${apelido(tr.entra)}`}</li>
                    ))}
                    {/* [LACUNA] a spec (SIM-25) não dá o texto de quem sai ou entra sem par; o rascunho usa "sem par". */}
                    {t.saiSemPar.map((id) => (
                      <li key={`sai-${id}`}>{`${apelido(id)} → sem par`}</li>
                    ))}
                    {t.entraSemPar.map((id) => (
                      <li key={`entra-${id}`}>{`sem par → ${apelido(id)}`}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          );
        })}
      </div>
      {resultado.naoEntra.length > 0 ? (
        <section className={estilos.secao} aria-labelledby="nao-entra">
          <h2 id="nao-entra" className={estilos.subtitulo}>
            Não entra
          </h2>
          <ListaJogadores
            jogadores={resultado.naoEntra}
            aoTocar={aoTocarJogador}
            movidos={movidos}
            classeExtra={estilos.lista}
          />
          <p className={estilos['campo__ajuda']}>{TEXTO_NAO_ENTRA_NOTA}</p>
        </section>
      ) : null}
      {resultado.ordemPrioridade ? (
        <details className={estilos.recolhivel}>
          <summary>Ordem de prioridade</summary>
          <ol>
            {resultado.ordemPrioridade.map((id) => (
              <li key={id}>{apelido(id)}</li>
            ))}
          </ol>
        </details>
      ) : null}
      {acoes}
    </>
  );
}
