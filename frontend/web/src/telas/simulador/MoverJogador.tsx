import type {
  AvaliarCorpo,
  ResultadoDois,
  ResultadoVarios,
  SugerirCorpo,
} from '@pelada/contrato/simulador';
import { useState } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { useAvaliar } from '../../dados/simulador.ts';
import type { ResultadoDoisNaTela } from './ResultadoDoisTimes.tsx';
import estilos from './simulador.module.css';

/**
 * Ajuste manual do resultado (t13, t14; simulador T49; SIM-64, SIM-65), de
 * `.specs/mockup/telas/t13-resultado-dois--{mover,trocar,recalculando,erro-recalcular}.html` e
 * `t14-resultado-varios--mover.html`:
 * - tocar num jogador abre a folha "Mover jogador" (título: o apelido) com os destinos do formato: em 2 times,
 *   titular ou "entra no 2º tempo" de cada time e "Não entra", mais o "Só 1º tempo"; em 3 ou mais, "Mover para Time N";
 *   o lugar atual vem marcado "atual"; "Trocar com…" lista os outros jogadores por lugar, e "Voltar";
 * - o movimento aparece na hora; o `avaliar` é pedido 300 ms depois do último ajuste e, enquanto isso, os números
 *   mostram "recalculando…";
 * - a falha do `avaliar` (inclusive 429, AD-083) mantém a composição e mostra "Não foi possível recalcular." com
 *   "Tentar de novo".
 */

export const TEXTO_FALHA_RECALCULAR = 'Não foi possível recalcular.';

type Dois = ResultadoDoisNaTela;
type JogadorDois = Dois['times'][number]['titulares'][number];

/** Lugar de um jogador: titular ou reserva de um time (2 times), "não entra", ou um time (3 ou mais). */
export type Lugar =
  | { tipo: 'titular'; time: 0 | 1 }
  | { tipo: 'reserva'; time: 0 | 1 }
  | { tipo: 'nao_entra' }
  | { tipo: 'time'; time: number };

function mesmoLugar(a: Lugar, b: Lugar): boolean {
  if (a.tipo !== b.tipo) return false;
  if (a.tipo === 'nao_entra') return true;
  return (a as { time: number }).time === (b as { time: number }).time;
}

export function lugarNoDois(r: Dois, id: string): Lugar | null {
  for (const t of [0, 1] as const) {
    if (r.times[t].titulares.some((j) => j.id === id)) return { tipo: 'titular', time: t };
    if (r.times[t].entramNo2oTempo.some((j) => j.id === id)) return { tipo: 'reserva', time: t };
  }
  return r.naoEntra.some((j) => j.id === id) ? { tipo: 'nao_entra' } : null;
}

export function lugarNoVarios(r: ResultadoVarios, id: string): Lugar | null {
  const i = r.times.findIndex((t) => t.jogadores.some((j) => j.id === id));
  return i >= 0 ? { tipo: 'time', time: i } : null;
}

function semJogador<T extends { id: string }>(lista: readonly T[], id: string): T[] {
  return lista.filter((j) => j.id !== id);
}

function jogadorDoDois(r: Dois, id: string): JogadorDois | null {
  for (const t of r.times) {
    const achado = [...t.titulares, ...t.entramNo2oTempo].find((j) => j.id === id);
    if (achado)
      return {
        ...achado,
        saiNoIntervalo: 'saiNoIntervalo' in achado ? achado.saiNoIntervalo : false,
      };
  }
  const n = r.naoEntra.find((j) => j.id === id);
  return n ? { ...n, saiNoIntervalo: false } : null;
}

/** Tira o jogador de onde está e o põe no fim do destino (2 times). */
export function moverNoDois(r: Dois, id: string, destino: Lugar): Dois {
  const j = jogadorDoDois(r, id);
  if (!j) return r;
  const times = r.times.map((t) => ({
    ...t,
    titulares: semJogador(t.titulares, id),
    entramNo2oTempo: semJogador(t.entramNo2oTempo, id),
  })) as unknown as Dois['times'];
  let naoEntra = semJogador(r.naoEntra, id);
  const { saiNoIntervalo: _sai, ...reserva } = j;
  if (destino.tipo === 'titular')
    times[destino.time].titulares = [
      ...times[destino.time].titulares,
      { ...j, saiNoIntervalo: false },
    ];
  else if (destino.tipo === 'reserva')
    times[destino.time].entramNo2oTempo = [...times[destino.time].entramNo2oTempo, reserva];
  else naoEntra = [...naoEntra, reserva];
  return { ...r, times, naoEntra };
}

/** Troca dois jogadores de lugar (2 times). */
export function trocarNoDois(r: Dois, a: string, b: string): Dois {
  const la = lugarNoDois(r, a);
  const lb = lugarNoDois(r, b);
  if (!la || !lb || mesmoLugar(la, lb)) return r;
  return moverNoDois(moverNoDois(r, a, lb), b, la);
}

/** Liga ou desliga o "Só 1º tempo" do jogador na composição (2 times). */
export function alternarSo1oNoDois(r: Dois, id: string): Dois {
  const vira = <T extends { id: string; so1oTempo: boolean }>(lista: readonly T[]) =>
    lista.map((j) => (j.id === id ? { ...j, so1oTempo: !j.so1oTempo } : j));
  return {
    ...r,
    times: r.times.map((t) => ({
      ...t,
      titulares: vira(t.titulares),
      entramNo2oTempo: vira(t.entramNo2oTempo),
    })) as unknown as Dois['times'],
    naoEntra: vira(r.naoEntra),
  };
}

export function moverNoVarios(r: ResultadoVarios, id: string, destino: number): ResultadoVarios {
  const j = r.times.flatMap((t) => t.jogadores).find((x) => x.id === id);
  if (!j) return r;
  return {
    ...r,
    times: r.times.map((t, i) => {
      const sem = semJogador(t.jogadores, id);
      return { ...t, jogadores: i === destino ? [...sem, j] : sem };
    }),
  };
}

export function trocarNoVarios(r: ResultadoVarios, a: string, b: string): ResultadoVarios {
  const la = lugarNoVarios(r, a);
  const lb = lugarNoVarios(r, b);
  if (!la || !lb || la.tipo !== 'time' || lb.tipo !== 'time' || la.time === lb.time) return r;
  return moverNoVarios(moverNoVarios(r, a, lb.time), b, la.time);
}

/** O corpo do `avaliar`: a entrada do `sugerir` mais a composição ajustada, só com ids e "só 1º" (SIM-62). */
export function corpoDoAvaliar(entrada: SugerirCorpo, r: Dois | ResultadoVarios): AvaliarCorpo {
  if (entrada.formato === 'dois_times' && r.formato === 'dois_times') {
    const so = (j: { id: string; so1oTempo: boolean }) => ({ id: j.id, so1oTempo: j.so1oTempo });
    const [a, b] = r.times;
    return {
      ...entrada,
      composicao: {
        times: [
          { titulares: a.titulares.map(so), entramNo2oTempo: a.entramNo2oTempo.map(so) },
          { titulares: b.titulares.map(so), entramNo2oTempo: b.entramNo2oTempo.map(so) },
        ],
        naoEntra: r.naoEntra.map((j) => j.id),
      },
    };
  }
  if (entrada.formato === 'varios_times' && r.formato === 'varios_times') {
    return {
      ...entrada,
      composicao: { times: r.times.map((t) => ({ jogadores: t.jogadores.map((j) => j.id) })) },
    };
  }
  throw new Error('formato da composição diferente da entrada');
}

export type ResultadoNaTela = Dois | ResultadoVarios;

/**
 * O estado do ajuste manual sobre uma sugestão: a composição na tela, os movidos, o recálculo e a falha dele.
 * `sugestao` muda (nova sugestão, refazer): o ajuste é descartado.
 */
export function useAjusteManual(
  grupoId: string,
  entrada: SugerirCorpo | null,
  sugestao: ResultadoDois | ResultadoVarios | null,
) {
  const [ajustado, setAjustado] = useState<ResultadoNaTela | null>(null);
  const [movidos, setMovidos] = useState<ReadonlySet<string>>(new Set());
  const [daSugestao, setDaSugestao] = useState(sugestao);
  if (daSugestao !== sugestao) {
    setDaSugestao(sugestao);
    setAjustado(null);
    setMovidos(new Set());
  }

  const corpo = ajustado && entrada ? corpoDoAvaliar(entrada, ajustado) : null;
  const avaliar = useAvaliar(grupoId, corpo);
  const estado = avaliar.estado;

  function aplicar(proximo: ResultadoNaTela, id: string) {
    setAjustado(proximo);
    setMovidos((m) => new Set([...m, id]));
  }

  // A composição local é a base dos próximos ajustes; na tela, o recálculo pronto (com os números novos) a substitui.
  // Enquanto recalcula ou depois de falhar, a tela mostra a composição local com os números anteriores.
  const base: ResultadoNaTela | null = ajustado ?? sugestao;
  const naTela: ResultadoNaTela | null =
    ajustado && estado.tipo === 'pronta' ? estado.previa : base;

  return {
    naTela,
    ajustado: ajustado !== null,
    movidos,
    recalculando: ajustado !== null && estado.tipo === 'calculando',
    falhou: ajustado !== null && estado.tipo === 'erro',
    tentarDeNovo: avaliar.tentarDeNovo,
    /** A composição que vai na confirmação (a ajustada, ou a sugerida). */
    composicaoAtual: base,
    mover(id: string, destino: Lugar) {
      if (!base) return;
      if (base.formato === 'dois_times') aplicar(moverNoDois(base, id, destino), id);
      else if (destino.tipo === 'time') aplicar(moverNoVarios(base, id, destino.time), id);
    },
    trocar(a: string, b: string) {
      if (!base) return;
      const proximo =
        base.formato === 'dois_times' ? trocarNoDois(base, a, b) : trocarNoVarios(base, a, b);
      setAjustado(proximo);
      setMovidos((m) => new Set([...m, a, b]));
    },
    alternarSo1o(id: string) {
      if (base?.formato === 'dois_times') aplicar(alternarSo1oNoDois(base, id), id);
    },
    descartar() {
      setAjustado(null);
      setMovidos(new Set());
    },
  };
}

/** A faixa da falha do recálculo, com "Tentar de novo" (SIM-65). */
export function FalhaRecalcular({ aoTentarDeNovo }: { aoTentarDeNovo: () => void }) {
  return (
    <Faixa
      tipo="erro"
      acao={
        <Botao variante="texto" onClick={aoTentarDeNovo}>
          Tentar de novo
        </Botao>
      }
    >
      {TEXTO_FALHA_RECALCULAR}
    </Faixa>
  );
}

interface Opcao {
  rotulo: string;
  lugar: Lugar;
}

function opcoesDoDois(r: Dois): Opcao[] {
  const [a, b] = r.times;
  return [
    { rotulo: `Titular do ${a.nome}`, lugar: { tipo: 'titular', time: 0 } },
    { rotulo: `Titular do ${b.nome}`, lugar: { tipo: 'titular', time: 1 } },
    { rotulo: `Entra no 2º tempo pelo ${a.nome}`, lugar: { tipo: 'reserva', time: 0 } },
    { rotulo: `Entra no 2º tempo pelo ${b.nome}`, lugar: { tipo: 'reserva', time: 1 } },
    { rotulo: 'Não entra', lugar: { tipo: 'nao_entra' } },
  ];
}

function opcoesDoVarios(r: ResultadoVarios, atual: Lugar | null): Opcao[] {
  return r.times.map((t, i) => ({
    rotulo: atual && atual.tipo === 'time' && atual.time === i ? t.nome : `Mover para ${t.nome}`,
    lugar: { tipo: 'time', time: i },
  }));
}

/** Os outros jogadores, por lugar, para o "Trocar com…". */
function gruposParaTrocar(
  r: ResultadoNaTela,
  id: string,
): Array<{ titulo: string; jogadores: Array<{ id: string; apelido: string }> }> {
  const fora = <T extends { id: string }>(l: readonly T[]) => l.filter((j) => j.id !== id);
  if (r.formato === 'dois_times') {
    const grupos = r.times.flatMap((t) => [
      { titulo: `${t.nome} · Titulares`, jogadores: fora(t.titulares) },
      { titulo: `${t.nome} · Entram no 2º tempo`, jogadores: fora(t.entramNo2oTempo) },
    ]);
    grupos.push({ titulo: 'Não entra', jogadores: fora(r.naoEntra) });
    return grupos.filter((g) => g.jogadores.length > 0);
  }
  return r.times
    .map((t) => ({ titulo: t.nome, jogadores: fora(t.jogadores) }))
    .filter((g) => g.jogadores.length > 0);
}

interface PropsFolha {
  resultado: ResultadoNaTela;
  jogadorId: string;
  aoMover: (destino: Lugar) => void;
  aoTrocar: (outro: string) => void;
  aoAlternarSo1o: () => void;
  aoFechar: () => void;
}

/** A folha "Mover jogador" e o passo "Trocar com…" (SIM-64). */
export function FolhaMover({
  resultado,
  jogadorId,
  aoMover,
  aoTrocar,
  aoAlternarSo1o,
  aoFechar,
}: PropsFolha) {
  const [trocando, setTrocando] = useState(false);
  const dois = resultado.formato === 'dois_times';
  const atual = dois ? lugarNoDois(resultado, jogadorId) : lugarNoVarios(resultado, jogadorId);
  const jogador = dois
    ? jogadorDoDois(resultado, jogadorId)
    : (resultado.times.flatMap((t) => t.jogadores).find((j) => j.id === jogadorId) ?? null);
  const apelido = jogador?.apelido ?? '';

  if (trocando) {
    return (
      <Dialogo formato="folha" titulo={`Trocar ${apelido} com…`} aoFechar={aoFechar}>
        {gruposParaTrocar(resultado, jogadorId).map((g) => (
          <section key={g.titulo}>
            <h3 className={estilos['cartao-time__grupo']}>{g.titulo}</h3>
            <ul className={estilos['folha__opcoes']}>
              {g.jogadores.map((j) => (
                <li key={j.id}>
                  <button
                    className={estilos['folha__opcao']}
                    type="button"
                    onClick={() => aoTrocar(j.id)}
                  >
                    {j.apelido}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <ul className={estilos['folha__opcoes']}>
          <li>
            <button
              className={estilos['folha__opcao']}
              type="button"
              onClick={() => setTrocando(false)}
            >
              Voltar
            </button>
          </li>
        </ul>
      </Dialogo>
    );
  }

  const opcoes = dois ? opcoesDoDois(resultado) : opcoesDoVarios(resultado, atual);
  return (
    <Dialogo formato="folha" titulo={apelido} aoFechar={aoFechar}>
      <ul className={estilos['folha__opcoes']}>
        {opcoes.map((o) => {
          const eAtual = atual !== null && mesmoLugar(o.lugar, atual);
          return (
            <li key={o.rotulo}>
              <button
                className={estilos['folha__opcao']}
                type="button"
                aria-current={eAtual || undefined}
                onClick={() => (eAtual ? aoFechar() : aoMover(o.lugar))}
              >
                {o.rotulo}
                {eAtual ? (
                  <span className={`${estilos.selo} ${estilos['selo--neutro']}`}>atual</span>
                ) : null}
              </button>
            </li>
          );
        })}
        <li>
          <button
            className={estilos['folha__opcao']}
            type="button"
            onClick={() => setTrocando(true)}
          >
            Trocar com…
          </button>
        </li>
      </ul>
      {dois && jogador ? (
        <label className={estilos.interruptor}>
          <span>Só 1º tempo</span>
          <input
            type="checkbox"
            role="switch"
            checked={jogador.so1oTempo}
            onChange={aoAlternarSo1o}
          />
          <span className={estilos['interruptor__trilho']} aria-hidden="true" />
          <span className={estilos['interruptor__estado']} aria-hidden="true">
            {jogador.so1oTempo ? 'Sim' : 'Não'}
          </span>
        </label>
      ) : null}
    </Dialogo>
  );
}
