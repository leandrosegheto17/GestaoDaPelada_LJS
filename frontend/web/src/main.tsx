import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
