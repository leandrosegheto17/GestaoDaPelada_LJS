/**
 * Regras do service worker (FUN-34, FUN-35, design C6), separadas do `sw.ts` para os testes
 * rodarem sem um `ServiceWorkerGlobalScope`. O `sw.ts` só liga estas funções ao Workbox.
 */

/** Shell do app: a SPA inteira sai do `index.html`. */
export const SHELL = 'index.html';

/** Página mostrada quando a navegação falha sem rede (FUN-35, AD-007). */
export const PAGINA_OFFLINE = 'offline.html';

/** Entrada do precache, no formato que o Workbox injeta em `self.__WB_MANIFEST`. */
export type EntradaPrecache =
  string | { url: string; revision?: string | null; integrity?: string };

function urlDa(entrada: EntradaPrecache): string {
  return (typeof entrada === 'string' ? entrada : entrada.url).replace(/^\/+/, '');
}

/**
 * Lista do precache: a do build, garantindo o shell e a página offline (FUN-34). O que já está
 * na lista do build não é repetido (o Workbox recusa a mesma URL duas vezes).
 */
export function precacheDoApp(doBuild: readonly EntradaPrecache[]): EntradaPrecache[] {
  const lista = [...doBuild];
  const presentes = new Set(lista.map(urlDa));
  for (const obrigatoria of [SHELL, PAGINA_OFFLINE]) {
    if (!presentes.has(obrigatoria)) lista.push({ url: obrigatoria, revision: null });
  }
  return lista;
}

export interface DependenciasNavegacao {
  /** Busca na rede (no SW, `fetch`). */
  buscar: (requisicao: Request) => Promise<Response>;
  /** Procura uma URL no precache (no SW, `matchPrecache`). */
  doCache: (url: string) => Promise<Response | undefined>;
}

/**
 * Navegação fora do precache (FUN-35): vai à rede; sem rede, responde a página offline do
 * cache. Resposta de erro do servidor (4xx, 5xx) passa como veio: só a falha de rede cai aqui.
 */
export async function responderNavegacao(
  requisicao: Request,
  deps: DependenciasNavegacao,
): Promise<Response> {
  try {
    return await deps.buscar(requisicao);
  } catch {
    // partidas-e-ranking T78 (PAR-149): o ranking público abre do shell, para mostrar o guardado sem rede.
    if (ehNavegacaoDoRanking(requisicao.url)) {
      const shell = await deps.doCache(SHELL);
      if (shell) return shell;
    }
    const offline = await deps.doCache(PAGINA_OFFLINE);
    if (offline) return offline;
    return new Response('Sem conexão.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/**
 * Única rota de `/api` que o service worker guarda (partidas-e-ranking T71; PAR-153; `BD:293-297`; G-17): o
 * `GET /api/publico/:slug/ranking` da própria origem, com ou sem `?mes=`. PDF, eventos e toda rota de admin ficam
 * sempre na rede.
 */
export const ROTA_RANKING_PUBLICO = /^\/api\/publico\/[a-z0-9-]{1,64}\/ranking$/;

export const CACHE_RANKING_PUBLICO = 'ranking-publico';
export const MAX_RANKINGS_GUARDADOS = 50;
/** Cabeçalho que marca a resposta servida do cache do SW (sem rede). */
export const CABECALHO_DO_CACHE = 'X-Pelada-Cache';

/** Navegação da página pública do ranking (`/g/:slug`), que sem rede recebe o shell e não a página offline. */
export const NAVEGACAO_RANKING = /^\/g\/[a-z0-9-]{1,64}\/?$/;

export function ehNavegacaoDoRanking(url: string): boolean {
  try {
    return NAVEGACAO_RANKING.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function ehRankingPublico(url: URL, origem: string): boolean {
  return url.origin === origem && ROTA_RANKING_PUBLICO.test(url.pathname);
}

/** Plugin do Workbox: a resposta tirada do cache leva `X-Pelada-Cache: 1`. */
export const marcarRespostaDoCache = {
  cachedResponseWillBeUsed: async ({
    cachedResponse,
  }: {
    cachedResponse?: Response | null;
  }): Promise<Response | null> => {
    if (!cachedResponse) return null;
    const cabecalhos = new Headers(cachedResponse.headers);
    cabecalhos.set(CABECALHO_DO_CACHE, '1');
    return new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers: cabecalhos,
    });
  },
};

/** Navegações que não são da SPA e nunca recebem o fallback. */
export const FORA_DO_FALLBACK: RegExp[] = [/^\/api\//];

/** Alvo mínimo onde os listeners são registrados (no SW, o próprio `self`). */
export interface AlvoDeEventos {
  addEventListener(tipo: string, ouvinte: (evento: unknown) => void): void;
}

/** `push`: vazio até a feature `notificacoes` (FUN-34). */
export function aoReceberPush(_evento: unknown): void {
  // Sem ação na fundação.
}

/** `notificationclick`: vazio até a feature `notificacoes` (FUN-34). */
export function aoClicarNotificacao(_evento: unknown): void {
  // Sem ação na fundação.
}

/** Registra os handlers de `push` e `notificationclick` (FUN-34). */
export function registrarEventos(alvo: AlvoDeEventos): void {
  alvo.addEventListener('push', aoReceberPush);
  alvo.addEventListener('notificationclick', aoClicarNotificacao);
}
