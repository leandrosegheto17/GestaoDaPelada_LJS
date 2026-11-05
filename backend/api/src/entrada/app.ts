import { Hono } from 'hono';
import type { Ambiente } from './ambiente.ts';
import { semCache, semSniff } from './middlewares/cabecalhos.ts';
import { health } from './rotas/health.ts';
import { ErroBancoIndisponivel, MENSAGEM_BANCO_INDISPONIVEL } from '../infraestrutura/db/cliente.ts';

export interface OpcoesApp {
  /** Rotas extras sob /api, só para os testes (ex.: rota que lança erro). */
  registrarExtras?: (api: Hono<Ambiente>) => void;
}

/**
 * App Hono das rotas /api/* (FUN-20). O resto do caminho é dos assets (SPA), pelo
 * `run_worker_first: ["/api/*"]` do wrangler.jsonc.
 */
export function criarApp(opcoes: OpcoesApp = {}): Hono<Ambiente> {
  const api = new Hono<Ambiente>().basePath('/api');

  // Antes de qualquer rota, para valer também no 404 e no 500 (FUN-22).
  api.use('*', semCache, semSniff);

  api.route('/', health);
  opcoes.registrarExtras?.(api);

  api.notFound((c) => c.json({ erro: 'Rota não encontrada.' }, 404));
  api.onError((erro, c) => {
    // Banco fora: 503 com mensagem fixa, sem a URL nem o erro do driver (FUN-16).
    if (erro instanceof ErroBancoIndisponivel) return c.json({ erro: MENSAGEM_BANCO_INDISPONIVEL }, 503);
    return c.json({ erro: 'Erro interno.' }, 500);
  });

  return api;
}
