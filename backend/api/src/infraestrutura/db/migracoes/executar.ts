import { runner } from 'node-pg-migrate';

/** Pasta das migrations (`<timestamp>_<nome>.sql`, com `-- Up Migration`). */
export const PASTA_MIGRACOES = import.meta.dirname;

/** Só os `.sql` são migrations; o código e os arquivos de apoio desta pasta ficam de fora. */
const IGNORAR = '(?:\\..*|(?!.*\\.sql$).*)';

export interface OpcoesMigracao {
  url: string;
  /** Pasta alternativa (testes). */
  pasta?: string;
  /** Quantas migrations pendentes aplicar; sem valor, todas. */
  quantas?: number;
  /** Registra como aplicada sem executar o SQL (linha de base no estado `legado`). */
  fake?: boolean;
}

/**
 * Aplica as migrations pendentes com o `node-pg-migrate`: cada uma na própria transação
 * (`singleTransaction: false`, o `--no-single-transaction` da CLI), com o advisory lock padrão.
 * Devolve os nomes aplicados, em ordem.
 */
export async function aplicarMigracoes(opcoes: OpcoesMigracao): Promise<string[]> {
  const aplicadas = await runner({
    databaseUrl: opcoes.url,
    dir: opcoes.pasta ?? PASTA_MIGRACOES,
    ignorePattern: IGNORAR,
    migrationsTable: 'pgmigrations',
    direction: 'up',
    count: opcoes.quantas ?? Infinity,
    fake: opcoes.fake ?? false,
    singleTransaction: false,
    checkOrder: true,
    log: () => undefined,
  });
  return aplicadas.map((m) => m.name);
}
