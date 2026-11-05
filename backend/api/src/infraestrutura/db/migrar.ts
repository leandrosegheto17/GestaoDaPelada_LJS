import { join } from 'node:path';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { detectarEstado, ErroEsquemaDivergente, listarMigracoes } from './estado.ts';

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
  const pasta = opcoes.pasta ?? PASTA_MIGRACOES;
  // FUN-10: banco divergente aborta antes de qualquer escrita, com a lista de diferenças.
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const deteccao = await detectarEstado(cliente, listarMigracoes(pasta));
    if (deteccao.estado === 'divergente') throw new ErroEsquemaDivergente(deteccao.diferencas);
  } finally {
    await cliente.end();
  }
  const aplicadas = await runner({
    databaseUrl: url,
    dir: join(pasta, '*.sql'),
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
