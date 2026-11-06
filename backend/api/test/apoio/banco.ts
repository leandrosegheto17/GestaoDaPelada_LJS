import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { exigirHostPermitido, HOSTS_TESTE } from '@pelada/scripts/host';
import { NOME_MOLDE_WORKER } from './molde.ts';

export const URL_TESTE_PADRAO = 'postgres://postgres:postgres@127.0.0.1:5432/pelada';

export interface OpcoesBancoDeTeste {
  /** URL do cluster de teste; padrão: DATABASE_URL_TESTE. */
  urlBase?: string;
  /** Aplica as migrações da v2 antes de entregar o banco. */
  migrado?: boolean;
}

function urlDoBanco(urlBase: string, nome: string): string {
  const u = new URL(urlBase);
  u.pathname = `/${nome}`;
  return u.toString();
}

async function comAdmin<T>(urlBase: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: urlBase });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/**
 * Cria um database `teste_<aleatório>`, entrega a URL a `fn` e o remove no `finally`,
 * mesmo quando `fn` lança erro. Recusa host fora da lista antes de abrir conexão (FUN-19).
 */
export async function bancoDeTeste<T>(
  fn: (url: string, nome: string) => Promise<T>,
  opcoes: OpcoesBancoDeTeste = {},
): Promise<T> {
  const urlBase = opcoes.urlBase ?? process.env.DATABASE_URL_TESTE ?? URL_TESTE_PADRAO;
  exigirHostPermitido(urlBase, HOSTS_TESTE);
  const nome = `teste_${randomBytes(6).toString('hex')}`;
  // No workerd o `node-pg-migrate` (via `jiti`) não carrega: o banco migrado vem do molde que o `globalSetup`
  // do projeto `worker` prepara no Node (`molde-worker.ts`), clonado pelo próprio Postgres.
  const noWorkerd = globalThis.navigator?.userAgent === 'Cloudflare-Workers';
  const clonar = noWorkerd && opcoes.migrado === true;
  await comAdmin(urlBase, (c) =>
    c.query(`CREATE DATABASE ${nome}${clonar ? ` TEMPLATE ${NOME_MOLDE_WORKER}` : ''}`),
  );
  try {
    const url = urlDoBanco(urlBase, nome);
    // Import dinâmico, só fora do workerd.
    if (opcoes.migrado && !noWorkerd)
      await (await import('../../src/infraestrutura/db/migrar.ts')).migrar(url);
    return await fn(url, nome);
  } finally {
    await comAdmin(urlBase, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

/** Atalho: roda `fn` com um cliente conectado ao banco dado, fechando-o no fim. */
export async function comCliente<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}
