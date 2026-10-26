import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { iniciarObservabilidade } from './app/observabilidade';
import { registrarServiceWorker } from './pwa/registro';
import './estilos/tokens.css';
import './estilos/global.css';

iniciarObservabilidade();
void registrarServiceWorker();

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado.');
createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
