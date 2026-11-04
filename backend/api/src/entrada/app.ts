import { Hono } from 'hono';
import { BancoIndisponivel } from '../infraestrutura/db/cliente.ts';
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
  app.onError((erro, c) => {
    // A resposta nunca carrega a mensagem do erro: ela pode trazer endereço de banco ou dado de quem pediu.
    if (erro instanceof BancoIndisponivel) return c.json({ erro: 'banco_indisponivel' }, 503);
    return c.json({ erro: 'erro_interno' }, 500);
  });

  return app;
}
