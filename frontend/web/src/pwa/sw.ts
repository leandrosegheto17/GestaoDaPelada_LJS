import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import {
  CACHE_RANKING_PUBLICO,
  ehRankingPublico,
  FORA_DO_FALLBACK,
  marcarRespostaDoCache,
  MAX_RANKINGS_GUARDADOS,
  precacheDoApp,
  registrarEventos,
  responderNavegacao,
} from './servico.ts';
import type { AlvoDeEventos, EntradaPrecache } from './servico.ts';

/**
 * Service worker do app (FUN-34, FUN-35, design C6), compilado pelo `vite-plugin-pwa` em
 * `injectManifest`. As regras ficam em `servico.ts`, que tem teste.
 *
 * Ordem das rotas: o precache responde primeiro (o shell em `/` e os ativos do build); a
 * navegação que sobra vai à rede e, sem rede, recebe a página offline.
 *
 * Ranking público (partidas-e-ranking T71; PAR-153): a única rota de `/api` registrada, com rede primeiro, guardando
 * só respostas 200 e no máximo 50. Nenhuma outra rota de `/api` passa pelo SW.
 *
 * Tipos mínimos locais em vez de `lib: webworker`, que colide com a `lib: DOM` do tsconfig.
 */
declare const self: AlvoDeEventos & {
  __WB_MANIFEST: EntradaPrecache[];
  location: { origin: string };
  skipWaiting(): Promise<void>;
};

cleanupOutdatedCaches();
precacheAndRoute(precacheDoApp(self.__WB_MANIFEST));

registerRoute(
  new NavigationRoute(
    ({ request }) =>
      responderNavegacao(request, {
        buscar: (r) => fetch(r),
        doCache: (url) => matchPrecache(url),
      }),
    { denylist: FORA_DO_FALLBACK },
  ),
);

// As classes de plugin do workbox declaram métodos opcionais sem `| undefined`, o que o
// `exactOptionalPropertyTypes` recusa contra o `WorkboxPlugin`; em tempo de execução são o mesmo objeto.
type PluginWorkbox = NonNullable<
  NonNullable<ConstructorParameters<typeof NetworkFirst>[0]>['plugins']
>[number];

registerRoute(
  ({ url, request }) => request.method === 'GET' && ehRankingPublico(url, self.location.origin),
  new NetworkFirst({
    cacheName: CACHE_RANKING_PUBLICO,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }) as PluginWorkbox,
      new ExpirationPlugin({ maxEntries: MAX_RANKINGS_GUARDADOS }) as PluginWorkbox,
      marcarRespostaDoCache,
    ],
  }),
  'GET',
);

registrarEventos(self);

// registerType 'autoUpdate': a versão nova assume sem esperar as abas fecharem.
self.addEventListener('install', () => {
  void self.skipWaiting();
});
