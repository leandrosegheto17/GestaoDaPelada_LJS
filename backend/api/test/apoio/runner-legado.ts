import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { comCliente } from './banco.ts';

/** Cópia literal das 13 migrations do legado (fixture de FUN-08 e FUN-09). */
export const PASTA_LEGADO = join(import.meta.dirname, 'legado');

export function lerMigracoesLegado(): { nome: string; sql: string }[] {
  return readdirSync(PASTA_LEGADO)
    .filter((nome) => nome.endsWith('.sql'))
    .sort()
    .map((nome) => ({ nome, sql: readFileSync(join(PASTA_LEGADO, nome), 'utf8') }));
}

/**
 * Reproduz o runner antigo do legado (`aplicar.ts`): cria `migracoes_aplicadas` e aplica cada
 * migration na própria transação, registrando o nome. É assim que o banco de produção chegou ao estado atual.
 */
export async function aplicarComoLegado(url: string, migracoes = lerMigracoesLegado()): Promise<void> {
  await comCliente(url, async (cliente) => {
    await cliente.query(
      `CREATE TABLE IF NOT EXISTS migracoes_aplicadas (
         nome text PRIMARY KEY,
         aplicada_em timestamptz NOT NULL DEFAULT now()
       )`,
    );
    for (const { nome, sql } of migracoes) {
      await cliente.query('BEGIN');
      try {
        await cliente.query(sql);
        await cliente.query('INSERT INTO migracoes_aplicadas (nome) VALUES ($1)', [nome]);
        await cliente.query('COMMIT');
      } catch (erro) {
        await cliente.query('ROLLBACK');
        throw erro;
      }
    }
  });
}
