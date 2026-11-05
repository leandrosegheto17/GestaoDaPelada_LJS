import { join } from 'node:path';
import { runner } from 'node-pg-migrate';

export const PASTA_MIGRACOES = join(import.meta.dirname, 'migracoes');
export const TABELA_MIGRACOES = 'pgmigrations';

export interface OpcoesMigrar {
  /** Pasta das migrações; padrão: as da v2. Os testes usam pastas de exemplo. */
  pasta?: string;
  /** Saída do runner; padrão: silencioso. */
  log?: (mensagem: string) => void;
}

/**
 * Aplica as migrações `.sql` pendentes (FUN-07): uma transação por migração
 * (`singleTransaction: false`), ordem conferida (`checkOrder`) e o advisory lock padrão,
 * que faz uma segunda execução simultânea esperar a primeira.
 * Devolve os nomes aplicados nesta execução.
 */
export async function migrar(url: string, opcoes: OpcoesMigrar = {}): Promise<string[]> {
  const aplicadas = await runner({
    databaseUrl: url,
    dir: join(opcoes.pasta ?? PASTA_MIGRACOES, '*.sql'),
    useGlob: true,
    migrationsTable: TABELA_MIGRACOES,
    direction: 'up',
    count: Infinity,
    singleTransaction: false,
    checkOrder: true,
    noLock: false,
    verbose: false,
    log: opcoes.log ?? (() => undefined),
  });
  return aplicadas.map((m) => m.name);
}
