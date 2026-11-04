import { join } from 'node:path';
import { runner } from 'node-pg-migrate';

export const PASTA_MIGRACOES = join(import.meta.dirname, 'migracoes');

export interface OpcoesMigrar {
  /** Pasta com os `.sql`; o padrão é a das 23 migrações copiadas. */
  pasta?: string;
}

/**
 * Aplica as migrações pendentes (FUN-07): cada arquivo `.sql` roda na própria transação
 * (`singleTransaction: false`), na ordem, com o lock padrão do node-pg-migrate contra
 * execuções simultâneas. Devolve os nomes aplicados agora.
 */
export async function migrar(url: string, opcoes: OpcoesMigrar = {}): Promise<string[]> {
  const aplicadas = await runner({
    databaseUrl: url,
    dir: opcoes.pasta ?? PASTA_MIGRACOES,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    singleTransaction: false,
    checkOrder: true,
    // a segunda execução espera o lock e depois não tem nada pendente (cada migração roda uma vez)
    advisoryLockMode: 'wait',
    // só os arquivos .sql entram; qualquer outro (hash, texto) é ignorado
    ignorePattern: '^(?!.*[.]sql$).*',
    log: () => undefined,
  });
  return aplicadas.map((m) => m.name);
}
