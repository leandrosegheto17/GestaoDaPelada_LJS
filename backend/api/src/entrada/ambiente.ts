import type { Kysely } from 'kysely';
import type { Banco } from '../infraestrutura/db/transacao.ts';
import type { FilaAvisos } from '../infraestrutura/fila/avisos.ts';
import type { Relogio } from '../infraestrutura/relogio.ts';
import type { RecursoLiberado } from './middlewares/recurso.ts';

/**
 * Bindings do Worker (wrangler.jsonc). Tipos mínimos escritos aqui, para não depender dos
 * tipos globais do runtime no typecheck do pacote.
 */

/** Binding de rate limit da Cloudflare (`ratelimits` no wrangler.jsonc). */
export interface LimiteDeTaxa {
  limit(opcoes: { key: string }): Promise<{ success: boolean }>;
}

/** Binding do Hyperdrive: só a string de conexão é usada. */
export interface HyperdriveBinding {
  readonly connectionString: string;
}

export interface Env {
  /** SHA do commit publicado (`--var` no deploy); `local` no wrangler dev. */
  VERSAO: string;
  /** URL pública do app, única fonte de endereço absoluto (FUN-23). */
  URL_PUBLICA: string;
  /** DSN do Sentry (secret). Ausente: o Sentry fica desligado e nada sai (FUN-25). */
  SENTRY_DSN?: string;
  /** Chave da API do Resend (secret). Ausente: o envio falha com 503 `email_indisponivel` (ACE-52). */
  RESEND_API_KEY?: string;
  /** Remetente dos e-mails de conta, ex. `Pelada <nao-responda@dominio>`. */
  RESEND_REMETENTE?: string;
  /** Teto diário de e-mails de conta (o do plano do Resend); 80% para cadastro, reenvio e convite (ACE-72). */
  LIMITE_EMAILS_DIA?: string;
  /** `1` só no `.env` local e no e2e: e-mails na caixa em memória e `GET /api/dev/emails` (T17). */
  EMAIL_DEV?: string;
  HYPERDRIVE: HyperdriveBinding;
  /**
   * Produtor da fila `avisos` (notificacoes T16; NOT-22, AD-098). Opcional no tipo: sem a fila criada (ou nos testes
   * que não a usam), o `agendarAviso` lança e o `aposCommit` só reporta.
   */
  FILA_AVISOS?: FilaAvisos;
  LIMITE_ENTRAR: LimiteDeTaxa;
  LIMITE_PUBLICO: LimiteDeTaxa;
  LIMITE_WEBHOOK: LimiteDeTaxa;
  LIMITE_ESCRITA: LimiteDeTaxa;
}

export type NomeLimite = 'LIMITE_ENTRAR' | 'LIMITE_PUBLICO' | 'LIMITE_WEBHOOK' | 'LIMITE_ESCRITA';

export interface Variaveis {
  /** Kysely da transação da requisição, posto pelo `comBanco` (FUN-16). Só existe nas rotas com ele. */
  db: Kysely<Banco>;
  /**
   * Registra uma tarefa para depois do `COMMIT` da requisição (notificacoes T15; NOT-20 a NOT-22), posta pelo `comBanco`.
   * Roda fora da resposta, só se o `COMMIT` der certo; é descartada no `ROLLBACK`. Só existe nas rotas com o `comBanco`.
   */
  aposCommit: (tarefa: () => unknown) => void;
  /** Conta da sessão, posta pelo `carregarSessao` (T20). Ausente = sem sessão válida. */
  contaId?: string;
  /** SHA-256 do token da sessão atual, para encerrá-la no sair (T20, T26). */
  tokenHash?: Uint8Array;
  /** Relógio da requisição, posto pelo `criarApp` antes de tudo (T19; GEL-32). */
  relogio: Relogio;
  /** Slug da rota pública, posto pelo `contextoPublico` (partidas-e-ranking T37; AD-034). */
  slugPublico?: string;
  /** A cadeia das rotas de grupo já rodou nesta requisição (T22). */
  grupoProtegido?: boolean;
  /** Ponto único da regra de plano, posto pelo `criarApp` (T32 da simulador; SIM-68, AD-049). */
  recursoLiberado: RecursoLiberado;
  /** A conta da sessão tem acesso ao financeiro do grupo, posto pelo `exigirFinanceiro` (financeiro T23; FIN-33). */
  acessaFinanceiro?: boolean;
}

export interface Ambiente {
  Bindings: Env;
  Variables: Variaveis;
}
