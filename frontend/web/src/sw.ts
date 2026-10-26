/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { responderNavegacao, URL_OFFLINE } from './pwa/regras-sw';

declare const self: ServiceWorkerGlobalScope;

// Precache do shell (HTML, JS, CSS, fontes e ícones) gerado pelo build.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// A versão nova assume sem esperar: a fundação não tem faixa de "nova versão".
self.addEventListener('install', () => {
  void self.skipWaiting();
});
clientsClaim();

// Handlers de push e de clique na notificação ficam registrados e vazios; a feature de notificações os preenche.
self.addEventListener('push', () => {});
self.addEventListener('notificationclick', () => {});

// Navegação: o shell (index.html do precache) atende qualquer rota do app; se falhar, a página offline (FUN-34).
const servirShell = createHandlerBoundToURL('/index.html');
registerRoute(
  new NavigationRoute(
    (opcoes) =>
      responderNavegacao(
        () => servirShell(opcoes),
        () => matchPrecache(URL_OFFLINE),
      ),
    { denylist: [/^\/api\//, /^\/\.well-known\//] },
  ),
);
