import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './estilos/tokens.css';
import './estilos/global.css';

// SPEC_DEVIATION: o legado monta aqui o `<App />`; o App, as rotas e o shell PWA entram na Fase 6 (T29 em diante).
// Até lá a página só carrega os estilos globais, para que o build do front base tenha o que empacotar.
const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado.');
createRoot(raiz).render(<StrictMode />);
