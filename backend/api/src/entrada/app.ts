import { Hono } from 'hono';
import type { Env } from './env.ts';
import { semCache, semSniff } from './middlewares/cabecalhos.ts';
import { health } from './rotas/health.ts';

export interface AppEnv {
  Bindings: Env;
}

/**
 * Monta o app. `preparar` existe só para os testes registrarem rotas próprias depois dos middlewares; o Worker
 * não passa nada.
 */
export function criarApp(preparar?: (app: Hono<AppEnv>) => void): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('/api/*', semCache, semSniff);
  app.route('/api', health);
  preparar?.(app);

  app.notFound((c) => c.json({ erro: 'nao_encontrado' }, 404));
  app.onError((_erro, c) => c.json({ erro: 'erro_interno' }, 500));

  return app;
}
