import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { iniciarObservabilidade } from './app/observabilidade.ts';
import './estilos/global.css';

// Sentry só com VITE_SENTRY_DSN (FUN-24, FUN-25), antes do primeiro render.
iniciarObservabilidade();

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
