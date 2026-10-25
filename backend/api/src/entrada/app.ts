import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Db } from '../infraestrutura/db/index.ts';
import type { Env } from './env.ts';
import { corpoGrande, erroInterno, naoEncontrado } from './erros.ts';
import { semCache } from './middlewares/cache.ts';
import { comBanco } from './middlewares/com-banco.ts';
import { exigirCabecalhoPelada } from './middlewares/csrf.ts';
import { criarLimiteTaxa, type Limitador } from './middlewares/limite-taxa.ts';
import { semSniff } from './middlewares/sem-sniff.ts';
import { rotaHealth } from './rotas/health.ts';

/** Maior corpo aceito em `/api/*`. */
export const LIMITE_CORPO_BYTES = 16 * 1024;

export interface Variaveis {
  /** Banco da requisição, sempre dentro da transação do `comBanco`; só conecta na primeira consulta. */
  db: Db;
  /** Contexto de RLS. Quem define (sessão, rota pública) vem nas features; o `comBanco` lê na primeira consulta. */
  contaId?: string;
  slugPublico?: string;
}

export type AppEnv = { Bindings: Env; Variables: Variaveis };

export interface OpcoesApp {
  /** Substitui os limitadores de taxa do ambiente (testes). */
  limitadores?: { entrar?: Limitador; publico?: Limitador };
}

/** Monta o app Hono. É uma fábrica: nada é guardado entre requisições. */
export function criarApp(opcoes: OpcoesApp = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('/api/*', semCache);
  app.use('/api/*', semSniff);
  app.use(
    '/api/sessao/entrar',
    criarLimiteTaxa((c) => opcoes.limitadores?.entrar ?? c.env?.LIMITE_ENTRAR),
  );
  app.use(
    '/api/publico/*',
    criarLimiteTaxa((c) => opcoes.limitadores?.publico ?? c.env?.LIMITE_PUBLICO),
  );
  app.use('/api/*', exigirCabecalhoPelada);
  app.use('/api/*', bodyLimit({ maxSize: LIMITE_CORPO_BYTES, onError: (c) => corpoGrande(c) }));
  app.use('/api/*', comBanco);

  app.route('/', rotaHealth);

  app.notFound((c) => naoEncontrado(c));
  app.onError((erro, c) => {
    // Só o nome do erro vai para o log: nunca a mensagem, o valor de configuração nem a pilha.
    console.error(`erro: ${erro.name}`);
    return erroInterno(c);
  });

  return app;
}
