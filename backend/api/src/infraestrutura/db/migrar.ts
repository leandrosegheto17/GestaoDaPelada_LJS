import { resolve } from 'node:path';
import { runner } from 'node-pg-migrate';

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
  const aplicadas = await runner({
    databaseUrl: url,
    dir: opcoes.dir ?? PASTA_MIGRACOES,
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
