/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

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
