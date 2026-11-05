import type { ResultadoVarios } from '@pelada/contrato/simulador';
import type { ReactNode } from 'react';
import { diaAbreviado, ListaJogadores, umaCasa } from './ResultadoDoisTimes.tsx';
import estilos from './simulador.module.css';

/**
 * Resultado em 3 ou mais times (t14; simulador T48; SIM-38, SIM-74), de
 * `.specs/mockup/telas/t14-resultado-varios--sucesso.html`:
 * - cabeçalho "<dia abreviado>, dd/mm · <descrição da prévia>" (SIM-74), com a descrição que a API devolve;
 * - um cartão por time ("Time 1", "Time 2"…), o incompleto com "Incompleto (R de N)" no título e a borda tracejada,
 *   com os apelidos e "Jogadores", "Nível médio", "Nível somado" e "Idade média" (SIM-38); média nula vira "—".
 * Cada jogador é um botão que abre a folha de mover (T49).
 */

/** "qui, 22/10 · 4 times de 4 + 1 time incompleto de 2" (SIM-74). */
export function cabecalhoVarios(data: string, descricao: string): string {
  return `${diaAbreviado(data)} · ${descricao}`;
}

/** "Incompleto (2 de 4)" (SIM-38). */
export function rotuloIncompleto(jogadores: number, n: number): string {
  return `Incompleto (${jogadores} de ${n})`;
}

interface PropsResultadoVarios {
  resultado: ResultadoVarios;
  recalculando?: boolean | undefined;
  aoTocarJogador?: (id: string) => void;
  movidos?: ReadonlySet<string> | undefined;
  antes?: ReactNode | undefined;
  acoes?: ReactNode | undefined;
}

export function ResultadoVariosTimes({
  resultado,
  recalculando = false,
  aoTocarJogador,
  movidos,
  antes,
  acoes,
}: PropsResultadoVarios) {
  const numero = (v: string) =>
    recalculando ? <span className={estilos.recalculando}>recalculando…</span> : v;
  return (
    <>
      <p className={`${estilos.paragrafo} ${estilos['texto-sec']}`}>
        {cabecalhoVarios(resultado.data, resultado.descricao)}
      </p>
      {antes}
      {resultado.avisos.length > 0 ? (
        <div role="status">
          <ul className={estilos.avisos}>
            {resultado.avisos.map((av) => (
              <li key={`${av.tipo}-${av.texto}`}>{av.texto}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className={`${estilos.times} ${estilos['times--varios']}`}>
        {resultado.times.map((t, i) => {
          const idTitulo = `time-${i + 1}`;
          return (
            <section
              key={t.nome}
              className={[
                estilos['cartao-time'],
                t.incompleto ? estilos['cartao-time--incompleto'] : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-labelledby={idTitulo}
            >
              <h2 id={idTitulo} className={estilos['cartao-time__titulo']}>
                {t.nome}
                {t.incompleto ? (
                  <span className={`${estilos.selo} ${estilos['selo--neutro']}`}>
                    {rotuloIncompleto(t.jogadores.length, resultado.n)}
                  </span>
                ) : null}
              </h2>
              <ListaJogadores
                jogadores={t.jogadores.map((j) => ({ ...j, so1oTempo: false }))}
                aoTocar={aoTocarJogador}
                movidos={movidos}
              />
              <dl className={estilos.indicadores} aria-busy={recalculando || undefined}>
                <dt>Jogadores</dt>
                <dd>{numero(String(t.indicadores.jogadores))}</dd>
                <dt>Nível médio</dt>
                <dd>{numero(umaCasa(t.indicadores.nivelMedio))}</dd>
                <dt>Nível somado</dt>
                <dd>{numero(umaCasa(t.indicadores.nivelSoma))}</dd>
                <dt>Idade média</dt>
                <dd>{numero(umaCasa(t.indicadores.idadeMedia))}</dd>
              </dl>
            </section>
          );
        })}
      </div>
      {acoes}
    </>
  );
}
