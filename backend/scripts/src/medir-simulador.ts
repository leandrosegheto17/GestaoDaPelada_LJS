import { readFileSync } from 'node:fs';
import { executarCli } from './conectar.ts';

/**
 * Medição de CPU do simulador na prévia publicada (simulador T43; SIM-61; AD-117, AD-032; `S:55`, `S:240`).
 *
 * Duas etapas, porque o CPU de cada execução só aparece no `wrangler tail` (ou no painel), não na resposta:
 *
 * 1. `pnpm --filter @pelada/scripts medir-simulador disparar <grupoId> --confirmo-previa`, com `URL_PUBLICA` (a origem
 *    da prévia, `F:1251`) e `SESSAO_MEDICAO` (o token da sessão de uma admin do grupo de teste, tirado do navegador; fica
 *    só no ambiente, nunca no repositório). Enquanto roda, o usuário deixa
 *    `wrangler tail gestaodapelada-v2 --format json > tail.jsonl` aberto noutro terminal. Só chama `contexto`, `previa`,
 *    `sugerir` e `avaliar`: nunca `escalacoes` (AD-117). Confere antes e depois, pela própria API, que as escalações e
 *    os eventos de uso do grupo não mudaram.
 * 2. `pnpm --filter @pelada/scripts medir-simulador analisar tail.jsonl`: lê a saída do tail, separa por rota e
 *    calcula o p99 do CPU de cada uma, e conta os 1102 (execução que passou do limite de recursos). Passa com p99 abaixo
 *    de 7 ms em toda rota e nenhum 1102; falha = pare para a decisão do usuário (contingência do ADR-017 do legado).
 *
 * Casos limite (listados antes do código, Domínio: sim):
 * - linha do tail que não é JSON (aviso do wrangler, linha em branco): ignorada e contada em `linhasIgnoradas`;
 * - evento de outra rota ou de outro método (o tail mostra o Worker inteiro): fora das amostras;
 * - evento da rota sem `cpuTime`: contado em `semCpu`, fora do p99; rota com zero amostras reprova (não há medição);
 * - evento com `outcome` de limite (`exceededCpu`, `exceededMemory`, `exceededResources`): conta como 1102, mesmo
 *   sem `cpuTime`;
 * - resposta diferente de 200 numa rota medida: contada em `naoOk` e reprova (a medição tem de ser do caminho feliz);
 * - p99 por posição mais próxima (nearest-rank): com 50 amostras, o 50º menor valor, isto é, o maior.
 *   [LACUNA] a Base não define o método do p99; nearest-rank é o mais conservador com poucas amostras.
 * - [LACUNA] "50 `sugerir` com 30 aptos (2 × 11 ilimitado e 6 × 5)": a Base não diz se são 50 no total ou 50 por
 *   configuração; o rascunho dispara 50 de cada (100 `sugerir`), o mais conservador.
 * - [LACUNA] os nomes `cpuTime`, `outcome` e `event.request.url` vêm do formato JSON do `wrangler tail`
 *   (PREMISSA: conferir com uma saída real no /executar antes de medir).
 */

/** Teto do p99 de CPU por rota na prévia (SIM-61). */
export const TETO_P99_MS = 7;

/** As rotas medidas e o sufixo do caminho de cada uma. */
export const ROTAS_MEDIDAS = {
  previa: '/simulador/previa',
  sugerir: '/simulador/sugerir',
  avaliar: '/simulador/avaliar',
} as const;
export type RotaMedida = keyof typeof ROTAS_MEDIDAS;

/** `outcome` do tail que equivale ao erro 1102 (Worker passou do limite de recursos). */
const OUTCOMES_1102 = new Set(['exceededCpu', 'exceededMemory', 'exceededResources']);

export class ErroMedicao extends Error {
  override name = 'ErroMedicao';
}

export interface MedicaoDaRota {
  amostras: number[];
  semCpu: number;
  naoOk: number;
  erros1102: number;
}

export interface ResultadoTail {
  rotas: Record<RotaMedida, MedicaoDaRota>;
  linhasIgnoradas: number;
}

interface EventoTail {
  outcome?: unknown;
  cpuTime?: unknown;
  event?: { request?: { url?: unknown; method?: unknown }; response?: { status?: unknown } };
}

function rotaDoEvento(e: EventoTail): RotaMedida | null {
  const url = e.event?.request?.url;
  const metodo = e.event?.request?.method;
  if (typeof url !== 'string' || metodo !== 'POST') return null;
  let caminho: string;
  try {
    caminho = new URL(url).pathname;
  } catch {
    return null;
  }
  for (const [rota, sufixo] of Object.entries(ROTAS_MEDIDAS) as Array<[RotaMedida, string]>) {
    if (caminho.startsWith('/api/grupos/') && caminho.endsWith(sufixo)) return rota;
  }
  return null;
}

/** Lê a saída do `wrangler tail --format json`: um evento JSON por linha. */
export function lerTail(texto: string): ResultadoTail {
  const vazia = (): MedicaoDaRota => ({ amostras: [], semCpu: 0, naoOk: 0, erros1102: 0 });
  const rotas: Record<RotaMedida, MedicaoDaRota> = {
    previa: vazia(),
    sugerir: vazia(),
    avaliar: vazia(),
  };
  let linhasIgnoradas = 0;
  for (const linha of texto.split(/\r?\n/)) {
    if (linha.trim() === '') continue;
    let e: EventoTail;
    try {
      e = JSON.parse(linha) as EventoTail;
    } catch {
      linhasIgnoradas++;
      continue;
    }
    if (e === null || typeof e !== 'object') {
      linhasIgnoradas++;
      continue;
    }
    const rota = rotaDoEvento(e);
    if (!rota) continue;
    const m = rotas[rota];
    if (typeof e.outcome === 'string' && OUTCOMES_1102.has(e.outcome)) m.erros1102++;
    const status = e.event?.response?.status;
    if (status !== undefined && status !== 200) m.naoOk++;
    if (typeof e.cpuTime === 'number' && Number.isFinite(e.cpuTime)) m.amostras.push(e.cpuTime);
    else m.semCpu++;
  }
  return { rotas, linhasIgnoradas };
}

/** Percentil por posição mais próxima (nearest-rank): o menor valor com pelo menos `p`% das amostras até ele. */
export function percentil(valores: readonly number[], p: number): number {
  if (valores.length === 0) throw new ErroMedicao('Sem amostras para calcular o percentil.');
  if (!(p > 0 && p <= 100)) throw new ErroMedicao(`Percentil fora de (0, 100]: ${p}`);
  const ordenados = [...valores].sort((a, b) => a - b);
  const posicao = Math.ceil((p / 100) * ordenados.length);
  return ordenados[posicao - 1]!;
}

export interface VereditoDaRota {
  rota: RotaMedida;
  amostras: number;
  p99: number | null;
  erros1102: number;
  naoOk: number;
  ok: boolean;
}

export interface Veredito {
  rotas: VereditoDaRota[];
  ok: boolean;
}

/** p99 abaixo do teto em toda rota medida, nenhum 1102 e nenhuma resposta fora do 200. */
export function julgar(r: ResultadoTail, teto = TETO_P99_MS): Veredito {
  const rotas = (Object.keys(ROTAS_MEDIDAS) as RotaMedida[]).map((rota): VereditoDaRota => {
    const m = r.rotas[rota];
    const p99 = m.amostras.length > 0 ? percentil(m.amostras, 99) : null;
    const ok = p99 !== null && p99 < teto && m.erros1102 === 0 && m.naoOk === 0;
    return { rota, amostras: m.amostras.length, p99, erros1102: m.erros1102, naoOk: m.naoOk, ok };
  });
  return { rotas, ok: rotas.every((v) => v.ok) };
}

// ---------------------------------------------------------------- disparo contra a prévia

/** Nome do cookie de sessão da API (`api/src/infraestrutura/sessao/cookie.ts:10`). */
const COOKIE_SESSAO = '__Host-sessao';

/** As 2 configurações do `sugerir` com 30 aptos (SIM-61): 2 × 11 sem limite de substituições e 6 × 5. */
export const CONFIGURACOES_SUGERIR = [
  { formato: 'dois_times', n: 11, k: 'ilimitado' },
  { formato: 'varios_times', n: 5 },
] as const;

/** Repetições por configuração (ver a [LACUNA] do topo). */
export const REPETICOES = 50;
const APTOS_MEDIDOS = 30;

export interface Ambiente {
  urlPublica: string;
  sessao: string;
}

export type Pedir = (
  caminho: string,
  metodo: 'GET' | 'POST',
  corpo?: unknown,
) => Promise<{ status: number; json: unknown }>;

/** Cliente da API da prévia: origem própria (passa na guarda de origem), cabeçalho `x-pelada` e o cookie da sessão. */
export function clienteDaPrevia(amb: Ambiente): Pedir {
  const origem = new URL(amb.urlPublica).origin;
  return async (caminho, metodo, corpo) => {
    const headers = new Headers({
      'x-pelada': '1',
      origin: origem,
      cookie: `${COOKIE_SESSAO}=${amb.sessao}`,
    });
    if (corpo !== undefined) headers.set('content-type', 'application/json');
    const r = await fetch(`${origem}/api${caminho}`, {
      method: metodo,
      headers,
      ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
    });
    const texto = await r.text();
    let json: unknown;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = texto;
    }
    return { status: r.status, json };
  };
}

/** O que não pode mudar no grupo (AD-117), lido pela própria API: escalações confirmadas e eventos de uso. */
export interface Contagens {
  escalacoes: number;
  eventos: number;
}

interface SemanaDeUso {
  aparelhosRanking: number;
  pdfsExportados: number;
  partidasLancadas: number;
  partidasEm48h: number;
  escalacoesConfirmadas: number;
}

export async function contagensDoGrupo(pedir: Pedir, grupoId: string): Promise<Contagens> {
  const r = await pedir(`/grupos/${grupoId}/uso`, 'GET');
  if (r.status !== 200)
    throw new ErroMedicao(`GET uso respondeu ${r.status}: confira a sessão e o grupo.`);
  const semanas = (r.json as { semanas: SemanaDeUso[] }).semanas;
  let escalacoes = 0;
  let eventos = 0;
  for (const s of semanas) {
    escalacoes += s.escalacoesConfirmadas;
    eventos += s.aparelhosRanking + s.pdfsExportados + s.partidasLancadas + s.escalacoesConfirmadas;
  }
  return { escalacoes, eventos };
}

interface ContextoMedido {
  dataSugerida: string;
  jogadores: Array<{ id: string }>;
}

interface JogadorDoResultado {
  id: string;
  so1oTempo?: boolean;
}

interface ResultadoDoisMedido {
  formato: 'dois_times';
  times: Array<{ titulares: JogadorDoResultado[]; entramNo2oTempo: JogadorDoResultado[] }>;
  naoEntra: JogadorDoResultado[];
}

/** A composição de 2 times do resultado na forma do corpo do `avaliar` (só ids e "só 1º"). */
function composicaoDe(r: ResultadoDoisMedido) {
  const so = (j: JogadorDoResultado) => ({ id: j.id, so1oTempo: j.so1oTempo === true });
  return {
    times: r.times.map((t) => ({
      titulares: t.titulares.map(so),
      entramNo2oTempo: t.entramNo2oTempo.map(so),
    })),
    naoEntra: r.naoEntra.map((j) => j.id),
  };
}

export interface RelatorioDisparo {
  data: string;
  pedidos: Record<RotaMedida, number>;
  naoOk: string[];
  antes: Contagens;
  depois: Contagens;
  ok: boolean;
}

/** Dispara as rotas medidas contra a prévia. Nunca chama `escalacoes` (AD-117). */
export async function disparar(
  pedir: Pedir,
  grupoId: string,
  repeticoes = REPETICOES,
): Promise<RelatorioDisparo> {
  const antes = await contagensDoGrupo(pedir, grupoId);
  const ctx = await pedir(`/grupos/${grupoId}/simulador/contexto`, 'GET');
  if (ctx.status !== 200) throw new ErroMedicao(`GET contexto respondeu ${ctx.status}.`);
  const contexto = ctx.json as ContextoMedido;
  if (contexto.jogadores.length < APTOS_MEDIDOS) {
    throw new ErroMedicao(
      `O grupo tem ${contexto.jogadores.length} ativos em ${contexto.dataSugerida}; a medição pede ${APTOS_MEDIDOS}. Pare e decida com o usuário.`,
    );
  }
  const data = contexto.dataSugerida;
  const aptos = contexto.jogadores
    .slice(0, APTOS_MEDIDOS)
    .map((j) => ({ id: j.id, so1oTempo: false }));
  const pedidos: Record<RotaMedida, number> = { previa: 0, sugerir: 0, avaliar: 0 };
  const naoOk: string[] = [];
  const registrar = (rota: RotaMedida, status: number) => {
    pedidos[rota]++;
    if (status !== 200) naoOk.push(`${rota}: ${status}`);
  };

  let sugestaoDois: ResultadoDoisMedido | null = null;
  for (const config of CONFIGURACOES_SUGERIR) {
    const corpo = {
      ...config,
      data,
      aptos: config.formato === 'dois_times' ? aptos : aptos.map(({ id }) => ({ id })),
    };
    const { data: _data, ...daPrevia } = corpo;
    for (let i = 0; i < repeticoes; i++) {
      const p = await pedir(`/grupos/${grupoId}/simulador/previa`, 'POST', daPrevia);
      registrar('previa', p.status);
      const s = await pedir(`/grupos/${grupoId}/simulador/sugerir`, 'POST', corpo);
      registrar('sugerir', s.status);
      if (s.status === 200 && config.formato === 'dois_times')
        sugestaoDois = s.json as ResultadoDoisMedido;
    }
  }
  if (!sugestaoDois) throw new ErroMedicao('Nenhuma sugestão de 2 times para medir o avaliar.');
  const corpoAvaliar = {
    ...CONFIGURACOES_SUGERIR[0],
    data,
    aptos,
    composicao: composicaoDe(sugestaoDois),
  };
  for (let i = 0; i < repeticoes; i++) {
    const a = await pedir(`/grupos/${grupoId}/simulador/avaliar`, 'POST', corpoAvaliar);
    registrar('avaliar', a.status);
  }

  const depois = await contagensDoGrupo(pedir, grupoId);
  const ok =
    naoOk.length === 0 &&
    depois.escalacoes === antes.escalacoes &&
    depois.eventos === antes.eventos;
  return { data, pedidos, naoOk, antes, depois, ok };
}

function imprimirVeredito(v: Veredito, linhasIgnoradas: number): void {
  for (const r of v.rotas) {
    console.log(
      `${r.rota}: ${r.amostras} amostras, p99 ${r.p99 === null ? 'sem medição' : `${r.p99} ms`}, ` +
        `1102: ${r.erros1102}, fora do 200: ${r.naoOk} → ${r.ok ? 'ok' : 'FALHA'}`,
    );
  }
  if (linhasIgnoradas > 0) console.log(`Linhas do tail ignoradas (não JSON): ${linhasIgnoradas}`);
  console.log(
    v.ok
      ? `Medição ok (p99 < ${TETO_P99_MS} ms, zero 1102).`
      : 'Medição reprovada: pare para a decisão do usuário.',
  );
}

if (import.meta.main) {
  await executarCli(async () => {
    const [etapa, alvo, ...resto] = process.argv.slice(2);
    if (etapa === 'analisar' && alvo) {
      const r = lerTail(readFileSync(alvo, 'utf8'));
      const v = julgar(r);
      imprimirVeredito(v, r.linhasIgnoradas);
      if (!v.ok) process.exitCode = 1;
      return;
    }
    if (etapa === 'disparar' && alvo) {
      if (!resto.includes('--confirmo-previa')) {
        throw new ErroMedicao(
          'Disparo contra a prévia publicada exige --confirmo-previa (confirmação do usuário na hora).',
        );
      }
      const urlPublica = process.env.URL_PUBLICA;
      const sessao = process.env.SESSAO_MEDICAO;
      if (!urlPublica || !sessao)
        throw new ErroMedicao('Defina URL_PUBLICA e SESSAO_MEDICAO no ambiente.');
      const r = await disparar(clienteDaPrevia({ urlPublica, sessao }), alvo);
      console.log(`Data: ${r.data}; pedidos: ${JSON.stringify(r.pedidos)}`);
      console.log(
        `Escalações antes/depois: ${r.antes.escalacoes}/${r.depois.escalacoes}; eventos: ${r.antes.eventos}/${r.depois.eventos}`,
      );
      if (r.naoOk.length > 0) console.log(`Fora do 200: ${r.naoOk.join(', ')}`);
      console.log(
        r.ok ? 'Disparo ok: agora rode a etapa analisar sobre o tail.' : 'Disparo com problemas.',
      );
      if (!r.ok) process.exitCode = 1;
      return;
    }
    throw new ErroMedicao(
      'Uso: medir-simulador disparar <grupoId> --confirmo-previa | medir-simulador analisar <tail.jsonl>',
    );
  });
}
