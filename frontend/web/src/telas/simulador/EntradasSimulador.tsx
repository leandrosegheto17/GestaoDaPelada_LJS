import {
  LIMITES_SIMULADOR,
  type ContextoResposta,
  type PreviaCorpo,
  type SugerirCorpo,
} from '@pelada/contrato/simulador';
import type { ReactNode } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { CampoData } from '../../componentes/CampoData.tsx';
import { exibirNivel } from '../../dados/habilidades.ts';
import estilos from './simulador.module.css';

/**
 * Entradas do simulador (t12; simulador T45; SIM-05, SIM-06, SIM-95), da marcação de
 * `.specs/mockup/telas/t12-simulador--{dois-times,tres-times}.html`:
 * - "Data da partida" com "Próximo dia de jogo." só quando a data é a sugerida pela API;
 * - "Formato": "2 times (1º e 2º tempo)" (padrão) ou "3 ou mais times";
 * - "Jogadores por time" com − e + (2 a 11);
 * - em 2 times, "Limite de substituições por time" com −, + e "Ilimitado", e o "Só 1º" de cada apto (padrão:
 *   desmarcado); em 3 ou mais, os dois somem (SIM-06);
 * - "Aptos (N)" com "Marcar todos" e "Desmarcar todos"; cada apto com o apelido e "nível d,d" ou "sem nota", e
 *   "sem ano" quando falta o ano de nascimento (SIM-95).
 * A tela não calcula times (SIM-15): a prévia vem da API e entra pelo `previa`.
 */

export type Formato = 'dois_times' | 'varios_times';

export interface Entradas {
  data: string;
  formato: Formato;
  n: number;
  /** Último valor numérico do limite, guardado quando "Ilimitado" está marcado. */
  k: number;
  ilimitado: boolean;
  /** Ids marcados como aptos. */
  aptos: ReadonlySet<string>;
  /** Ids com "Só 1º" (só vale em 2 times). */
  so1o: ReadonlySet<string>;
}

/**
 * [LACUNA] a spec não define o N e o K iniciais; o rascunho usa os do mockup (`t12-simulador--dois-times.html`: N = 7,
 * K = 2). O /executar confirma.
 */
export const N_INICIAL = 7;
export const K_INICIAL = 2;

/** As entradas iniciais: a data sugerida, 2 times, todos os ativos marcados, ninguém "só 1º". */
export function entradasIniciais(contexto: ContextoResposta, data?: string): Entradas {
  return {
    data: data ?? contexto.dataSugerida,
    formato: 'dois_times',
    n: N_INICIAL,
    k: K_INICIAL,
    ilimitado: false,
    aptos: new Set(contexto.jogadores.map((j) => j.id)),
    so1o: new Set(),
  };
}

/** Os aptos na ordem do contexto (a do apelido, SIM-03). */
function aptosEmOrdem(e: Entradas, contexto: ContextoResposta): string[] {
  return contexto.jogadores.filter((j) => e.aptos.has(j.id)).map((j) => j.id);
}

/** O corpo da prévia (sem a data, SIM-09). */
export function corpoDaPrevia(e: Entradas, contexto: ContextoResposta): PreviaCorpo {
  const ids = aptosEmOrdem(e, contexto);
  if (e.formato === 'varios_times')
    return { formato: 'varios_times', n: e.n, aptos: ids.map((id) => ({ id })) };
  return {
    formato: 'dois_times',
    n: e.n,
    k: e.ilimitado ? 'ilimitado' : e.k,
    aptos: ids.map((id) => ({ id, so1oTempo: e.so1o.has(id) })),
  };
}

/** O corpo do `sugerir`: a prévia com a data (SIM-47). */
export function corpoDoSugerir(e: Entradas, contexto: ContextoResposta): SugerirCorpo {
  return { ...corpoDaPrevia(e, contexto), data: e.data };
}

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

interface PropsEntradas {
  contexto: ContextoResposta;
  entradas: Entradas;
  aoMudar: (e: Entradas) => void;
  aoTrocarData: (data: string) => void;
  /** A prévia da API (T46). */
  previa?: ReactNode | undefined;
  /** A barra com "Sugerir times" (T46, T47). */
  acao?: ReactNode | undefined;
}

interface PropsNumero {
  id: string;
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  rotuloMenos: string;
  rotuloMais: string;
  desabilitado?: boolean | undefined;
  aoMudar: (v: number) => void;
  lateral?: ReactNode | undefined;
}

function CampoNumero({
  id,
  rotulo,
  valor,
  min,
  max,
  rotuloMenos,
  rotuloMais,
  desabilitado,
  aoMudar,
  lateral,
}: PropsNumero) {
  return (
    <div className={estilos.campo}>
      <label className={estilos['campo__rotulo']} htmlFor={id}>
        {rotulo}
      </label>
      <div className={estilos['campo-numero']}>
        <button
          className={estilos['campo-numero__botao']}
          type="button"
          aria-label={rotuloMenos}
          disabled={desabilitado || valor <= min}
          onClick={() => aoMudar(limitar(valor - 1, min, max))}
        >
          −
        </button>
        <input
          className={estilos['campo__entrada']}
          id={id}
          type="number"
          min={min}
          max={max}
          inputMode="numeric"
          value={valor}
          disabled={desabilitado}
          onChange={(ev) => {
            const v = Number.parseInt(ev.target.value, 10);
            if (Number.isFinite(v)) aoMudar(limitar(v, min, max));
          }}
        />
        <button
          className={estilos['campo-numero__botao']}
          type="button"
          aria-label={rotuloMais}
          disabled={desabilitado || valor >= max}
          onClick={() => aoMudar(limitar(valor + 1, min, max))}
        >
          +
        </button>
        {lateral}
      </div>
    </div>
  );
}

export const TEXTO_PROXIMO_DIA = 'Próximo dia de jogo.';
export const TEXTO_SEM_ANO = 'sem ano';

export function EntradasSimulador({
  contexto,
  entradas,
  aoMudar,
  aoTrocarData,
  previa,
  acao,
}: PropsEntradas) {
  const dois = entradas.formato === 'dois_times';
  const marcados = contexto.jogadores.filter((j) => entradas.aptos.has(j.id)).length;

  function alternar(conjunto: ReadonlySet<string>, id: string): Set<string> {
    const novo = new Set(conjunto);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    return novo;
  }

  return (
    <form noValidate className={estilos['lado-a-lado']} onSubmit={(ev) => ev.preventDefault()}>
      <div className={estilos.formulario}>
        <CampoData
          id="data"
          rotulo="Data da partida"
          value={entradas.data}
          ajuda={entradas.data === contexto.dataSugerida ? TEXTO_PROXIMO_DIA : undefined}
          onChange={(ev) => aoTrocarData(ev.target.value)}
        />
        <fieldset className={estilos.segmentado}>
          <legend className="sr">Formato</legend>
          <label>
            <input
              type="radio"
              name="formato"
              value="dois"
              checked={dois}
              onChange={() => aoMudar({ ...entradas, formato: 'dois_times' })}
            />
            <span>2 times (1º e 2º tempo)</span>
          </label>
          <label>
            <input
              type="radio"
              name="formato"
              value="varios"
              checked={!dois}
              onChange={() => aoMudar({ ...entradas, formato: 'varios_times' })}
            />
            <span>3 ou mais times</span>
          </label>
        </fieldset>
        <CampoNumero
          id="n"
          rotulo="Jogadores por time"
          valor={entradas.n}
          min={LIMITES_SIMULADOR.nMin}
          max={LIMITES_SIMULADOR.nMax}
          rotuloMenos="Diminuir jogadores por time"
          rotuloMais="Aumentar jogadores por time"
          aoMudar={(n) => aoMudar({ ...entradas, n })}
        />
        {dois ? (
          <CampoNumero
            id="k"
            rotulo="Limite de substituições por time"
            valor={entradas.k}
            min={LIMITES_SIMULADOR.kMin}
            max={LIMITES_SIMULADOR.kMax}
            rotuloMenos="Diminuir limite"
            rotuloMais="Aumentar limite"
            desabilitado={entradas.ilimitado}
            aoMudar={(k) => aoMudar({ ...entradas, k })}
            lateral={
              <label className={estilos.caixa}>
                <input
                  type="checkbox"
                  checked={entradas.ilimitado}
                  onChange={(ev) => aoMudar({ ...entradas, ilimitado: ev.target.checked })}
                />
                <span>Ilimitado</span>
              </label>
            }
          />
        ) : null}
        {previa}
      </div>
      <div>
        <h2 className={estilos.subtitulo}>{`Aptos (${marcados})`}</h2>
        <div className={estilos['grupo-botoes']}>
          <Botao
            variante="texto"
            onClick={() =>
              aoMudar({ ...entradas, aptos: new Set(contexto.jogadores.map((j) => j.id)) })
            }
          >
            Marcar todos
          </Botao>
          <Botao
            variante="texto"
            onClick={() => aoMudar({ ...entradas, aptos: new Set(), so1o: new Set() })}
          >
            Desmarcar todos
          </Botao>
        </div>
        <ul className={estilos['lista-aptos']}>
          {contexto.jogadores.map((j) => {
            const apto = entradas.aptos.has(j.id);
            return (
              <li key={j.id} className={estilos.item}>
                <label className={`${estilos.caixa} ${estilos['item__principal']}`}>
                  <input
                    type="checkbox"
                    checked={apto}
                    onChange={() => {
                      const aptos = alternar(entradas.aptos, j.id);
                      const so1o = new Set(entradas.so1o);
                      if (!aptos.has(j.id)) so1o.delete(j.id);
                      aoMudar({ ...entradas, aptos, so1o });
                    }}
                  />
                  <span>{j.apelido}</span>
                </label>
                <span className={estilos['item__lado']}>
                  {j.semNota ? (
                    <span className={`${estilos.selo} ${estilos['selo--atencao']}`}>
                      {exibirNivel(j.nivel, true)}
                    </span>
                  ) : (
                    <span
                      className={estilos['texto-sec']}
                    >{`nível ${exibirNivel(j.nivel, false)}`}</span>
                  )}
                  {j.semAno ? (
                    <span className={`${estilos.selo} ${estilos['selo--neutro']}`}>
                      {TEXTO_SEM_ANO}
                    </span>
                  ) : null}
                  {dois ? (
                    <label className={estilos.interruptor}>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label={`Só 1º tempo: ${j.apelido}`}
                        checked={entradas.so1o.has(j.id)}
                        disabled={!apto}
                        onChange={() =>
                          aoMudar({ ...entradas, so1o: alternar(entradas.so1o, j.id) })
                        }
                      />
                      <span className={estilos['interruptor__trilho']} aria-hidden="true" />
                      <span className={estilos['interruptor__estado']} aria-hidden="true">
                        Só 1º
                      </span>
                    </label>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {acao}
    </form>
  );
}
