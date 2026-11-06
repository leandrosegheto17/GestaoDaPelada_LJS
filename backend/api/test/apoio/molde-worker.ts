import pg from 'pg';
import { exigirHostPermitido, HOSTS_TESTE } from '@pelada/scripts/host';
import { migrar } from '../../src/infraestrutura/db/migrar.ts';
import { NOME_MOLDE_WORKER } from './molde.ts';

/**
 * `globalSetup` do projeto `worker`: o workerd não carrega o `node-pg-migrate`, então o banco migrado nasce aqui,
 * no Node, uma vez por rodada, e o `bancoDeTeste({ migrado: true })` o clona com `CREATE DATABASE ... TEMPLATE`.
 */
function urlDe(urlBase: string, nome: string): string {
  const u = new URL(urlBase);
  u.pathname = `/${nome}`;
  return u.toString();
}

async function comAdmin(urlBase: string, sql: string): Promise<void> {
  const c = new pg.Client({ connectionString: urlBase });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

function urlBase(): string {
  return process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';
}

export async function setup(): Promise<void> {
  const base = urlBase();
  exigirHostPermitido(base, HOSTS_TESTE);
  await comAdmin(base, `DROP DATABASE IF EXISTS ${NOME_MOLDE_WORKER} WITH (FORCE)`);
  await comAdmin(base, `CREATE DATABASE ${NOME_MOLDE_WORKER}`);
  try {
    await migrar(urlDe(base, NOME_MOLDE_WORKER));
  } catch (erro) {
    await comAdmin(base, `DROP DATABASE IF EXISTS ${NOME_MOLDE_WORKER} WITH (FORCE)`);
    throw erro;
  }
}

export async function teardown(): Promise<void> {
  await comAdmin(urlBase(), `DROP DATABASE IF EXISTS ${NOME_MOLDE_WORKER} WITH (FORCE)`);
}
