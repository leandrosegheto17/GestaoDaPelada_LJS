import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../estilos/tokens.css';
import '../estilos/global.css';
import { PaginaOffline } from './PaginaOffline';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado.');
createRoot(raiz).render(
  <StrictMode>
    <PaginaOffline />
  </StrictMode>,
);
