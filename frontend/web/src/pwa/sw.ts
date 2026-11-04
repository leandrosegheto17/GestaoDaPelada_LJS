import { matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';

type Entrada = { url: string; revision: string | null };

/** O que o service worker usa do escopo global (evita a lib `webworker`, que conflita com `DOM`). */
export interface EscopoSw {
  __WB_MANIFEST: Entrada[];
  addEventListener(tipo: string, ouvinte: (evento: unknown) => void): void;
}

interface Dependencias {
  precache: (entradas: Entrada[]) => void;
  registrarNavegacao: (responder: (request: Request) => Promise<Response>) => void;
}

interface DependenciasNavegacao {
  buscar: (request: Request) => Promise<Response>;
  offline: () => Promise<Response | undefined>;
}

/** O shell e a página offline sempre entram no precache, mesmo se o glob do build os perdesse. */
export function entradasPrecache(manifest: Entrada[]): Entrada[] {
  const entradas = [...manifest];
  for (const url of ['index.html', 'offline.html']) {
    if (!entradas.some((e) => e.url === url)) entradas.push({ url, revision: null });
  }
  return entradas;
}

/** Navegação: rede primeiro; sem rede (e fora do precache), a página offline. */
export async function responderNavegacao(
  request: Request,
  deps: DependenciasNavegacao = {
    buscar: (r) => fetch(r),
    offline: () => matchPrecache('offline.html'),
  },
): Promise<Response> {
  try {
    return await deps.buscar(request);
  } catch {
    const offline = await deps.offline();
    return offline ?? Response.error();
  }
}

/** Handlers de `push` e `notificationclick` ficam vazios até a feature `notificacoes` (FUN-34). */
export function configurar(
  escopo: EscopoSw,
  deps: Dependencias = {
    precache: (entradas) => precacheAndRoute(entradas),
    registrarNavegacao: (responder) =>
      registerRoute(
        ({ request }) => request.mode === 'navigate',
        ({ request }) => responder(request),
      ),
  },
): void {
  deps.precache(entradasPrecache(escopo.__WB_MANIFEST));
  deps.registrarNavegacao((request) => responderNavegacao(request));
  escopo.addEventListener('push', () => {});
  escopo.addEventListener('notificationclick', () => {});
}

declare const self: EscopoSw & { constructor: { name: string } };

// Só roda dentro do service worker; importado por um teste (jsdom), não registra nada.
// O plugin troca o texto literal `self.__WB_MANIFEST` pela lista do build.
if (self.constructor.name === 'ServiceWorkerGlobalScope') {
  configurar({
    __WB_MANIFEST: self.__WB_MANIFEST,
    addEventListener: (tipo, ouvinte) => self.addEventListener(tipo, ouvinte),
  });
}
