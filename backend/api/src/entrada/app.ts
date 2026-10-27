import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Db } from '../infraestrutura/db/index.ts';
import { remetenteDoAmbiente } from '../infraestrutura/email/ambiente.ts';
import type { Remetente } from '../infraestrutura/email/remetente.ts';
import type { Env } from './env.ts';
import { corpoGrande, erroInterno, naoEncontrado } from './erros.ts';
import { semCache } from './middlewares/cache.ts';
import { comBanco } from './middlewares/com-banco.ts';
import { exigirCabecalhoPelada } from './middlewares/csrf.ts';
import { criarLimiteTaxa, type Limitador } from './middlewares/limite-taxa.ts';
import { semSniff } from './middlewares/sem-sniff.ts';
import { carregarSessao, exigirSessao } from './middlewares/sessao.ts';
import { exigirVinculo } from './middlewares/vinculo.ts';
import { rotaContaMinha } from './rotas/conta-minha.ts';
import { rotaContaCadastro } from './rotas/conta-cadastro.ts';
import { rotaHealth } from './rotas/health.ts';
import { rotaSessaoRecuperacao } from './rotas/sessao-recuperacao.ts';
import { rotaSessao } from './rotas/sessao.ts';
import { ligarSentry } from './sentry.ts';

/** Maior corpo aceito em `/api/*`. */
export const LIMITE_CORPO_BYTES = 16 * 1024;

/** Rotas sem sessão da tabela do C4 (design conta-e-acesso): todas passam pelo `LIMITE_ENTRAR` (ACE-50). */
export const ROTAS_LIMITE_ENTRAR = [
  '/api/conta',
  '/api/conta/confirmar',
  '/api/conta/reenviar-confirmacao',
  '/api/sessao/entrar',
  '/api/sessao/esqueci-senha',
  '/api/sessao/nova-senha',
  '/api/convites/ler',
  '/api/convites/cadastrar',
] as const;

export interface Variaveis {
  /** Banco da requisição, sempre dentro da transação do `comBanco`; só conecta na primeira consulta. */
  db: Db;
  /**
   * Contexto de RLS, lido pelo `comBanco` na primeira consulta. `contaId` vem do `carregarSessao` (sessão válida);
   * `slugPublico`, das rotas públicas.
   */
  contaId?: string;
  slugPublico?: string;
  /** SHA-256 do token da sessão da requisição (sair, trocar a senha mantendo a sessão atual). */
  tokenHash?: Uint8Array;
  /** Quem envia os e-mails de conta: o do ambiente, ou o de teste. */
  remetente: Remetente;
}

export type AppEnv = { Bindings: Env; Variables: Variaveis };

export interface OpcoesApp {
  /** Substitui os limitadores de taxa do ambiente (testes). */
  limitadores?: { entrar?: Limitador; publico?: Limitador };
  /** Substitui o remetente de e-mail do ambiente (testes). */
  remetente?: Remetente;
}

/** Monta o app Hono. É uma fábrica: nada é guardado entre requisições. */
export function criarApp(opcoes: OpcoesApp = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Primeiro de todos, para ver os erros de qualquer middleware. Sem SENTRY_DSN, desligado (FUN-24).
  ligarSentry(app);
  app.use('/api/*', semCache);
  app.use('/api/*', semSniff);
  // O CSRF vem antes dos limitadores: escrita sem X-Pelada não consome a cota de ninguém (ACE-49, SEC-005).
  app.use('/api/*', exigirCabecalhoPelada);
  const limiteEntrar = criarLimiteTaxa((c) => opcoes.limitadores?.entrar ?? c.env?.LIMITE_ENTRAR);
  for (const caminho of ROTAS_LIMITE_ENTRAR) app.use(caminho, limiteEntrar);
  app.use(
    '/api/publico/*',
    criarLimiteTaxa((c) => opcoes.limitadores?.publico ?? c.env?.LIMITE_PUBLICO),
  );
  app.use('/api/*', bodyLimit({ maxSize: LIMITE_CORPO_BYTES, onError: (c) => corpoGrande(c) }));
  // A sessão é resolvida numa transação curta própria antes da transação da rota (AD-007, ACE-47).
  app.use('/api/*', async (c, proximo) => {
    c.set('remetente', opcoes.remetente ?? remetenteDoAmbiente(c.env));
    await proximo();
  });
  app.use('/api/*', carregarSessao);
  app.use('/api/*', comBanco);
  // Toda rota de dado de grupo: sessão e vínculo com o grupo (G-03, ACE-41).
  app.use('/api/grupos/:grupoId/*', exigirSessao, exigirVinculo);

  app.route('/', rotaHealth);
  app.route('/', rotaSessao);
  app.route('/', rotaContaCadastro);
  app.route('/', rotaSessaoRecuperacao);
  app.route('/', rotaContaMinha);

  app.notFound((c) => naoEncontrado(c));
  app.onError((erro, c) => {
    // Só o nome do erro vai para o log: nunca a mensagem, o valor de configuração nem a pilha.
    console.error(`erro: ${erro.name}`);
    return erroInterno(c);
  });

  return app;
}
