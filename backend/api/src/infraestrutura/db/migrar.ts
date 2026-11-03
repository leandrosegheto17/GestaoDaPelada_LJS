import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { detectarEstado } from './estado.ts';

export const PASTA_MIGRACOES = resolve(import.meta.dirname, 'migracoes');

export interface OpcoesMigrar {
  /** Pasta dos `.sql`; o padrão é a pasta oficial. Só os testes trocam. */
  dir?: string;
}

/**
 * Aplica as migrações pendentes (FUN-07). Cada migração roda na própria transação
 * (`singleTransaction: false`), na ordem dos nomes (`checkOrder`), sob o advisory lock padrão:
 * uma segunda execução espera a primeira terminar (`advisoryLockMode: 'wait'`) e depois não encontra nada pendente.
 * Só arquivos `.sql` entram.
 */
export async function migrar(url: string, opcoes: OpcoesMigrar = {}): Promise<string[]> {
  const dir = opcoes.dir ?? PASTA_MIGRACOES;
  await exigirEstadoConhecido(url, dir);
  const aplicadas = await runner({
    databaseUrl: url,
    dir,
    ignorePattern: '.*(?<![.]sql)$',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    singleTransaction: false,
    checkOrder: true,
    advisoryLockMode: 'wait',
    log: () => undefined,
  });
  return aplicadas.map((m) => m.name);
}

/** FUN-10: antes de qualquer escrita, aborta se o banco não é vazio nem gerenciado por estas migrações. */
async function exigirEstadoConhecido(url: string, dir: string): Promise<void> {
  const arquivos = readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((n) => n.replace(/\.sql$/, ''));
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const { estado, diferencas } = await detectarEstado(c, arquivos);
    if (estado === 'divergente') {
      const lista = diferencas.map((d) => `- ${d}`).join('\n');
      throw new Error(`Banco divergente, nada foi alterado. Diferenças:\n${lista}`);
    }
  } finally {
    await c.end();
  }
}
