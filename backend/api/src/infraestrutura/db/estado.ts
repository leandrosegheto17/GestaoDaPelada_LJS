import { readdirSync } from 'node:fs';
import type pg from 'pg';

export type Estado = 'vazio' | 'gerenciado' | 'divergente';

export interface Deteccao {
  estado: Estado;
  /** Só no estado `divergente`: o que impede a migração. */
  diferencas: string[];
}

/** Nomes das migrações da pasta, na ordem (o nome do arquivo sem `.sql`). */
export function nomesDasMigracoes(pasta: string): string[] {
  return readdirSync(pasta)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((n) => n.replace(/\.sql$/, ''));
}

/**
 * Classifica o banco antes de migrar (FUN-10):
 * - `vazio`: nenhuma tabela da aplicação e nada aplicado;
 * - `gerenciado`: a `pgmigrations` é prefixo, na ordem, da lista de arquivos;
 * - `divergente`: qualquer outro caso, com a lista do que difere.
 */
export async function detectarEstado(db: pg.ClientBase, pasta: string): Promise<Deteccao> {
  const arquivos = nomesDasMigracoes(pasta);
  const tabelas = (
    await db.query<{ t: string }>(
      "select tablename as t from pg_tables where schemaname = 'public' and tablename <> 'pgmigrations' order by 1",
    )
  ).rows.map((r) => r.t);
  const temRegistro = (
    await db.query<{ ok: boolean }>("select to_regclass('public.pgmigrations') is not null as ok")
  ).rows[0]!.ok;
  const aplicadas = temRegistro
    ? (await db.query<{ name: string }>('select name from pgmigrations order by id')).rows.map(
        (r) => r.name,
      )
    : [];

  if (tabelas.length === 0 && aplicadas.length === 0) return { estado: 'vazio', diferencas: [] };

  const diferencas: string[] = [];
  if (!temRegistro) {
    diferencas.push(`tabelas sem a tabela pgmigrations: ${tabelas.join(', ')}`);
  } else if (aplicadas.length === 0) {
    diferencas.push(`pgmigrations vazia, mas o banco já tem tabelas: ${tabelas.join(', ')}`);
  } else {
    const conhecidas = new Set(arquivos);
    for (const nome of aplicadas) {
      if (!conhecidas.has(nome)) diferencas.push(`migração aplicada sem arquivo: ${nome}`);
    }
    if (diferencas.length === 0) {
      aplicadas.forEach((nome, i) => {
        if (nome !== arquivos[i]) {
          diferencas.push(
            `ordem diferente na posição ${i + 1}: esperado ${arquivos[i] ?? '(nenhuma)'}, aplicado ${nome}`,
          );
        }
      });
    }
  }
  return diferencas.length === 0
    ? { estado: 'gerenciado', diferencas: [] }
    : { estado: 'divergente', diferencas };
}
