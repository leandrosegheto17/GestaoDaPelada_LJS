import pg from 'pg';
import type { Env } from '../../src/entrada/ambiente.ts';
import type { ConexaoPg } from '../../src/infraestrutura/db/cliente.ts';

/**
 * Apoio dos testes de banco por requisição (FUN-16), no Node: o app Hono roda com
 * `app.request(caminho, init, env, ctx)`, com um `executionCtx` falso que guarda as promessas
 * do `waitUntil` para o teste esperar o fechamento.
 */

export interface ContextoFalso {
  waitUntil(p: Promise<unknown>): void;
  passThroughOnException(): void;
  props: Record<string, unknown>;
  /** Espera tudo o que foi agendado no `waitUntil`. */
  esperar(): Promise<void>;
  /** Quantas promessas foram agendadas. */
  agendadas(): number;
}

export function contextoFalso(): ContextoFalso {
  const pendentes: Promise<unknown>[] = [];
  return {
    waitUntil: (p) => {
      pendentes.push(p);
    },
    passThroughOnException: () => undefined,
    props: {},
    esperar: async () => {
      await Promise.all(pendentes);
    },
    agendadas: () => pendentes.length,
  };
}

const permite = { limit: async () => ({ success: true }) };

/** Env do Worker com o Hyperdrive apontando para a URL dada. */
export function envCom(connectionString: string): Env {
  return {
    VERSAO: 'v',
    URL_PUBLICA: '',
    HYPERDRIVE: { connectionString },
    LIMITE_ENTRAR: permite,
    LIMITE_PUBLICO: permite,
    LIMITE_WEBHOOK: permite,
    LIMITE_ESCRITA: permite,
  } as unknown as Env;
}

/** Acrescenta `application_name` à URL, para achar a sessão em `pg_stat_activity`. */
export function comNomeDeAplicacao(url: string, nome: string): string {
  const u = new URL(url);
  u.searchParams.set('application_name', nome);
  return u.toString();
}

/** Sessões abertas com o `application_name` dado, vistas por outra conexão. */
export async function sessoesCom(admin: pg.Client, nome: string): Promise<number> {
  const r = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1 AND pid <> pg_backend_pid()`,
    [nome],
  );
  return r.rows[0]?.n ?? 0;
}

export interface FabricaEspiada {
  fabrica: (connectionString: string) => ConexaoPg;
  /** Quantas conexões a fábrica criou. */
  criadas(): number;
  /** SQL de cada consulta, na ordem, de todas as conexões. */
  consultas: string[];
  /** Faz a consulta cujo SQL satisfaz `quando` lançar o erro dado. */
  falharEm(quando: (sql: string) => boolean, erro: Error): void;
}

/** Fábrica de `pg.Client` real que conta as conexões e registra as consultas. */
export function fabricaEspiada(): FabricaEspiada {
  let criadas = 0;
  const consultas: string[] = [];
  const falhas: Array<[(sql: string) => boolean, Error]> = [];
  return {
    consultas,
    criadas: () => criadas,
    falharEm: (quando, erro) => {
      falhas.push([quando, erro]);
    },
    fabrica: (connectionString) => {
      criadas += 1;
      const c = new pg.Client({ connectionString });
      return {
        connect: () => c.connect(),
        end: () => c.end(),
        query: async (sql, valores) => {
          consultas.push(sql);
          const falha = falhas.find(([quando]) => quando(sql));
          if (falha) throw falha[1];
          return c.query(sql, valores);
        },
      };
    },
  };
}

/**
 * Fábrica de `pg.Client` que, logo depois de conectar como o superusuário local, passa a rodar
 * como `pelada_app` (`SET ROLE`, da sessão inteira): o app dos testes enxerga o banco como em
 * produção, com a RLS valendo (T20, T21). Conta as conexões criadas.
 */
export function fabricaComoApp(): { fabrica: (connectionString: string) => ConexaoPg; criadas(): number } {
  let criadas = 0;
  return {
    criadas: () => criadas,
    fabrica: (connectionString) => {
      criadas += 1;
      const c = new pg.Client({ connectionString });
      return {
        connect: async () => {
          await c.connect();
          await c.query('SET ROLE pelada_app');
        },
        end: () => c.end(),
        query: (sql, valores) => c.query(sql, valores),
      };
    },
  };
}
