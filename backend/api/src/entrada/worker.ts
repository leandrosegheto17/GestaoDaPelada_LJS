import { criarApp } from './app.ts';

// Entrada do Worker. As rotas /api/* chegam aqui por `run_worker_first`; o resto é servido pelos assets.
export default criarApp();
