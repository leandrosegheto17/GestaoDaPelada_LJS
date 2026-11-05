import type { AvaliarCorpo, ResultadoDois, ResultadoVarios, SugerirCorpo } from '@pelada/contrato';
import type {
  Apto,
  Aviso,
  ComposicaoDois,
  ComposicaoEntrada,
  EntradaSimulador,
  IndicadoresTimeDois,
  IndicadoresTimeVarios,
} from '@pelada/dominio';
import type { AptoDoSimulador } from '../../infraestrutura/db/repositorios/jogadores-leitura.ts';

/**
 * Entrada e saída do simulador entre o contrato e o domínio (T35 e T36 da simulador; SIM-47, SIM-62, SIM-82).
 *
 * - Entrada: os aptos do corpo (só id e, em 2 times, "só 1º") ganham apelido, nível, `semNota` e ano do banco, lidos
 *   pelo `jogadoresLeitura.paraSimulador` na data; o id que não é ativo do grupo na data não vira apto (a rota responde
 *   422, SIM-54, SIM-80).
 * - Saída: cada jogador só com id, apelido, nível, `semNota`, `semAno` e "só 1º" (SIM-82); o ano não sai, só `semAno`.
 *   Times de 2 com o nome "Time A" e "Time B" (SIM-41); de 3 ou mais, "Time 1"… e o incompleto marcado (SIM-38).
 */

type CorpoSimulador = SugerirCorpo | AvaliarCorpo;

/** Os aptos do corpo com os dados do banco; nulo quando algum id não é ativo do grupo na data. */
export function aptosDoCorpo(corpo: CorpoSimulador, ativos: readonly AptoDoSimulador[]): Apto[] | null {
  const porId = new Map(ativos.map((a) => [a.id, a]));
  const aptos: Apto[] = [];
  for (const apto of corpo.aptos) {
    const doBanco = porId.get(apto.id);
    if (!doBanco) return null;
    aptos.push({
      id: doBanco.id,
      apelido: doBanco.apelido,
      nivel: doBanco.nivel,
      semNota: doBanco.semNota,
      anoNascimento: doBanco.anoNascimento,
      so1oTempo: 'so1oTempo' in apto ? apto.so1oTempo : false,
    });
  }
  return aptos;
}

/** A entrada do domínio: em 3 ou mais o K não vale (SIM-33); o domínio o ignora. */
export function entradaDoDominio(corpo: CorpoSimulador, aptos: readonly Apto[]): EntradaSimulador {
  return {
    formato: corpo.formato,
    data: corpo.data,
    n: corpo.n,
    k: corpo.formato === 'dois_times' ? corpo.k : 'ilimitado',
    aptos,
  };
}

/** A composição do corpo do `avaliar` na forma do domínio (T36; `ComposicaoEntrada` de T16). */
export function composicaoDoCorpo(corpo: AvaliarCorpo): ComposicaoEntrada {
  if (corpo.formato === 'varios_times') {
    return { formato: 'varios_times', times: corpo.composicao.times.map((t) => t.jogadores) };
  }
  const [a, b] = corpo.composicao.times;
  return {
    formato: 'dois_times',
    times: [
      { titulares: a.titulares, entram: a.entramNo2oTempo },
      { titulares: b.titulares, entram: b.entramNo2oTempo },
    ],
    naoEntra: corpo.composicao.naoEntra,
  };
}

/**
 * Os aptos com o "só 1º" que a composição ajustada traz (T36): é o que o admin acabou de marcar, e vale sobre o dos
 * aptos (`avaliar.ts:4`). Em 3 ou mais não há "só 1º".
 */
export function comSo1oDaComposicao(aptos: readonly Apto[], corpo: AvaliarCorpo): Apto[] {
  if (corpo.formato === 'varios_times') return [...aptos];
  const marcados = new Map<string, boolean>();
  for (const time of corpo.composicao.times) {
    for (const j of [...time.titulares, ...time.entramNo2oTempo]) marcados.set(j.id, j.so1oTempo);
  }
  return aptos.map((a) => ({ ...a, so1oTempo: marcados.get(a.id) ?? a.so1oTempo }));
}

/** Uma linha de log por requisição do `sugerir` (SIM-60): formato, N, K e quantos aptos; sem id, apelido nem grupo. */
export function registrarRequisicao(rota: 'sugerir', corpo: CorpoSimulador): void {
  console.log(
    JSON.stringify({
      evento: `simulador_${rota}`,
      formato: corpo.formato,
      n: corpo.n,
      k: corpo.formato === 'dois_times' ? corpo.k : null,
      aptos: corpo.aptos.length,
    }),
  );
}

function jogadorDe(aptos: ReadonlyMap<string, Apto>, id: string) {
  const a = aptos.get(id);
  // O domínio só devolve ids da entrada; ausência é erro de programação.
  if (!a) throw new Error('jogador da composição fora dos aptos');
  return { id: a.id, apelido: a.apelido, nivel: a.nivel, semNota: a.semNota, semAno: a.anoNascimento === null };
}

function avisos(lista: readonly Aviso[]): ResultadoDois['avisos'] {
  return lista.map((a) => ({ tipo: a.tipo, texto: a.texto }));
}

/** O resultado de 2 times sem a ordem de prioridade (o `avaliar` não a tem, SIM-62). */
export function resultadoDoisSemOrdem(
  corpo: CorpoSimulador & { formato: 'dois_times' },
  descricao: string,
  composicao: ComposicaoDois,
  indicadores: readonly [IndicadoresTimeDois, IndicadoresTimeDois],
  listaDeAvisos: readonly Aviso[],
  aptos: readonly Apto[],
): Omit<ResultadoDois, 'ordemPrioridade'> {
  const porId = new Map(aptos.map((a) => [a.id, a]));
  const so1o = (id: string): boolean => porId.get(id)?.so1oTempo === true;
  const nomes = ['Time A', 'Time B'] as const;
  const times = composicao.times.map((time, i) => {
    const ind = indicadores[i] as IndicadoresTimeDois;
    const saem = new Set(ind.saem);
    return {
      nome: nomes[i] as string,
      titulares: time.titulares.map((id) => ({ ...jogadorDe(porId, id), so1oTempo: so1o(id), saiNoIntervalo: saem.has(id) })),
      entramNo2oTempo: time.entram.map((id) => ({ ...jogadorDe(porId, id), so1oTempo: so1o(id) })),
      trocas: ind.pares.map((p) => ({ sai: p.sai, entra: p.entra })),
      saiSemPar: [...ind.saiSemPar],
      entraSemPar: [...ind.entraSemPar],
      indicadores: {
        jogadores1oTempo: ind.jogadores1oTempo,
        jogadores2oTempo: ind.jogadores2oTempo,
        nivelSoma1oTempo: ind.nivelSoma1oTempo,
        nivelMedio1oTempo: ind.nivelMedio1oTempo,
        nivelSoma2oTempo: ind.nivelSoma2oTempo,
        nivelMedio2oTempo: ind.nivelMedio2oTempo,
        idadeMedia: ind.idadeMedia,
        substituicoes: ind.substituicoes,
      },
    };
  }) as [ResultadoDois['times'][0], ResultadoDois['times'][1]];
  return {
    formato: 'dois_times',
    data: corpo.data,
    n: corpo.n,
    k: corpo.k,
    descricao,
    avisos: avisos(listaDeAvisos),
    times,
    naoEntra: composicao.naoEntra.map((id) => ({ ...jogadorDe(porId, id), so1oTempo: so1o(id) })),
  };
}

/** O resultado de 3 ou mais times: um cartão por time, o incompleto marcado (SIM-38). */
export function resultadoVarios(
  corpo: CorpoSimulador & { formato: 'varios_times' },
  descricao: string,
  times: readonly (readonly string[])[],
  incompleto: number | null,
  indicadores: readonly IndicadoresTimeVarios[],
  listaDeAvisos: readonly Aviso[],
  aptos: readonly Apto[],
): ResultadoVarios {
  const porId = new Map(aptos.map((a) => [a.id, a]));
  return {
    formato: 'varios_times',
    data: corpo.data,
    n: corpo.n,
    descricao,
    avisos: avisos(listaDeAvisos),
    times: times.map((ids, i) => {
      const ind = indicadores[i] as IndicadoresTimeVarios;
      return {
        nome: `Time ${i + 1}`,
        incompleto: incompleto === i,
        jogadores: ids.map((id) => jogadorDe(porId, id)),
        indicadores: {
          jogadores: ind.jogadores,
          nivelSoma: ind.nivelSoma,
          nivelMedio: ind.nivelMedio,
          idadeMedia: ind.idadeMedia,
        },
      };
    }),
  };
}
