import { join } from 'node:path';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { detectarEstado } from './estado.ts';

export const PASTA_MIGRACOES = join(import.meta.dirname, 'migracoes');

/** O banco não está vazio nem alinhado com as migrações: nada foi alterado (FUN-10). */
export class EstadoDivergente extends Error {
  readonly diferencas: string[];

  constructor(diferencas: string[]) {
    super(
      [
        'O banco não está vazio nem alinhado com as migrações: nada foi alterado. Diferenças:',
        ...diferencas.map((d) => `  - ${d}`),
      ].join('\n'),
    );
    this.name = 'EstadoDivergente';
    this.diferencas = diferencas;
  }
}

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
  const pasta = opcoes.pasta ?? PASTA_MIGRACOES;
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const { estado, diferencas } = await detectarEstado(cliente, pasta);
    if (estado === 'divergente') throw new EstadoDivergente(diferencas);
  } finally {
    await cliente.end();
  }

  const aplicadas = await runner({
    databaseUrl: url,
    dir: pasta,
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
