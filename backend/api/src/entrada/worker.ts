import { criarApp } from './app.ts';

/** Entrada do Worker (wrangler.jsonc `main`). Só /api/* chega aqui; o resto são os assets. */
export default criarApp();
