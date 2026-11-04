import pg from 'pg';
import { exigirHostPermitido, HOSTS_LOCAIS } from '@pelada/scripts/host';
import { migrar } from '../../src/infraestrutura/db/migrar.ts';
import { URL_ADMIN_PADRAO, comTravaDeMigracao } from './banco.ts';
import { BANCO_DO_WORKER, ROLE_DO_WORKER, TABELA_DE_ESCRITA } from './banco-worker.ts';

function urlDoBanco(base: string, banco: string): string {
  const url = new URL(base);
  url.pathname = `/${banco}`;
  return url.toString();
}

async function comCliente(url: string, corpo: (c: pg.Client) => Promise<void>): Promise<void> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await corpo(c);
  } finally {
    await c.end();
  }
}

/**
 * Prepara o banco dos testes de workerd: recria `teste_worker`, migra como o superusuário (AD-009), cria a tabela de
 * escrita dos testes e cria a role de login `worker_teste`, membro de `pelada_app`. Devolve a função que remove o
 * banco e a role ao fim.
 */
export default async function preparar(): Promise<() => Promise<void>> {
  const base = process.env.DATABASE_URL_TESTE ?? URL_ADMIN_PADRAO;
  exigirHostPermitido(base, HOSTS_LOCAIS);
  const senha = process.env.WORKER_TESTE_SENHA;
  if (!senha) throw new Error('WORKER_TESTE_SENHA ausente: o vitest.config deveria defini-la.');

  const admin = urlDoBanco(base, 'postgres');
  const remover = () =>
    comCliente(admin, async (c) => {
      await c.query(`drop database if exists ${BANCO_DO_WORKER} with (force)`);
      await c.query(`drop role if exists ${ROLE_DO_WORKER}`);
    });

  await remover();
  await comCliente(admin, async (c) => {
    await c.query(`create database ${BANCO_DO_WORKER}`);
  });
  const url = urlDoBanco(base, BANCO_DO_WORKER);
  // as roles são do cluster: migrar dois bancos ao mesmo tempo disputaria o CREATE ROLE
  await comTravaDeMigracao(() => migrar(url));
  await comCliente(url, async (c) => {
    await c.query(
      `create table ${TABELA_DE_ESCRITA} (id serial primary key, valor text not null);
       grant select, insert, update, delete on ${TABELA_DE_ESCRITA} to pelada_app;
       grant usage on all sequences in schema public to pelada_app`,
    );
  });
  await comCliente(admin, async (c) => {
    const { rows } = await c.query<{ sql: string }>(
      "select format('create role %I login password %L in role pelada_app', $1::text, $2::text) as sql",
      [ROLE_DO_WORKER, senha],
    );
    await c.query(rows[0]!.sql);
  });
  return remover;
}
