import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { exigirHostPermitido } from '../../src/infraestrutura/seguranca/trava-host.ts';

/** URL do servidor Postgres de teste (local ou serviço do CI). Sem ela, a suíte falha dizendo o que fazer. */
export function urlDeTeste(): string {
  const url = process.env['DATABASE_URL_TESTE'];
  if (!url) {
    throw new Error('Defina DATABASE_URL_TESTE (veja o .env) e rode `docker compose up -d` antes dos testes de banco.');
  }
  return url;
}

export function urlDoBanco(url: string, banco: string): string {
  const nova = new URL(url);
  nova.pathname = `/${banco}`;
  return nova.toString();
}

export interface BancoTemporario {
  url: string;
  nome: string;
  remover(): Promise<void>;
}

async function comAdmin<T>(acao: (admin: pg.Client) => Promise<T>): Promise<T> {
  const admin = new pg.Client({ connectionString: urlDoBanco(urlDeTeste(), 'postgres') });
  await admin.connect();
  try {
    return await acao(admin);
  } finally {
    await admin.end();
  }
}

/**
 * Cria um banco vazio no servidor de teste, passando antes pela trava de host.
 * `remover` apaga o banco, mesmo com conexões abertas.
 */
export async function criarBancoTemporario(): Promise<BancoTemporario> {
  await exigirHostPermitido({ url: urlDeTeste() });
  const nome = `teste_${randomBytes(6).toString('hex')}`;
  await comAdmin((admin) => admin.query(`CREATE DATABASE ${nome}`));
  return {
    nome,
    url: urlDoBanco(urlDeTeste(), nome),
    remover: () =>
      comAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`)).then(() => undefined),
  };
}

/** Abre um cliente, executa e fecha. */
export async function comCliente<T>(url: string, acao: (cliente: pg.Client) => Promise<T>): Promise<T> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    return await acao(cliente);
  } finally {
    await cliente.end();
  }
}
