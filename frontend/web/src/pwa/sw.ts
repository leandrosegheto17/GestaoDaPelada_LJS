import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { FORA_DO_FALLBACK, precacheDoApp, registrarEventos, responderNavegacao } from './servico.ts';
import type { AlvoDeEventos, EntradaPrecache } from './servico.ts';

/**
 * Service worker do app (FUN-34, FUN-35, design C6), compilado pelo `vite-plugin-pwa` em
 * `injectManifest`. As regras ficam em `servico.ts`, que tem teste.
 *
 * Ordem das rotas: o precache responde primeiro (o shell em `/` e os ativos do build); a
 * navegação que sobra vai à rede e, sem rede, recebe a página offline.
 *
 * Tipos mínimos locais em vez de `lib: webworker`, que colide com a `lib: DOM` do tsconfig.
 */
declare const self: AlvoDeEventos & {
  __WB_MANIFEST: EntradaPrecache[];
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

registrarEventos(self);

// registerType 'autoUpdate': a versão nova assume sem esperar as abas fecharem.
self.addEventListener('install', () => {
  void self.skipWaiting();
});
