import type { ClientBase } from 'pg';

export type EstadoBanco = 'vazio' | 'gerenciado' | 'divergente';

export interface ResultadoEstado {
  estado: EstadoBanco;
  /** Preenchida só quando `divergente`: uma frase por diferença. */
  diferencas: string[];
}

/*
 * SPEC_DEVIATION: o design (C2) declara `detectarEstado(db): EstadoBanco`. Aqui devolve também a lista de
 * diferenças e recebe os nomes dos arquivos, porque FUN-10 manda listá-las e o runner aceita outra pasta nos testes.
 */

/**
 * `vazio`: sem tabelas (a `pgmigrations`, se existir, está vazia).
 * `gerenciado`: a `pgmigrations` é prefixo, na mesma ordem, da lista de arquivos.
 * `divergente`: qualquer outro caso (FUN-10). Só lê; nunca escreve.
 */
export async function detectarEstado(
  db: ClientBase,
  arquivos: readonly string[],
): Promise<ResultadoEstado> {
  const { rows: tabelas } = await db.query<{ t: string }>(
    "select tablename as t from pg_tables where schemaname = 'public' and tablename <> 'pgmigrations' order by 1",
  );
  const nomesDasTabelas = tabelas.map((r) => r.t);
  const temHistorico =
    (await db.query<{ t: string | null }>("select to_regclass('public.pgmigrations')::text as t"))
      .rows[0]!.t !== null;
  const registradas = temHistorico
    ? (await db.query<{ name: string }>('select name from pgmigrations order by id')).rows.map(
        (r) => r.name,
      )
    : [];

  const diferencas: string[] = [];
  if (!temHistorico && nomesDasTabelas.length > 0) {
    diferencas.push(
      `o banco tem tabelas e nenhuma pgmigrations (banco sem histórico de migrações): ${nomesDasTabelas.join(', ')}`,
    );
  }
  if (temHistorico && registradas.length === 0 && nomesDasTabelas.length > 0) {
    diferencas.push(
      `a pgmigrations está vazia, mas o banco tem tabelas: ${nomesDasTabelas.join(', ')}`,
    );
  }
  registradas.forEach((nome, i) => {
    if (!arquivos.includes(nome)) {
      diferencas.push(`migração registrada que não existe nos arquivos: ${nome}`);
    } else if (arquivos[i] !== nome) {
      diferencas.push(
        `ordem diferente na posição ${i + 1}: registrada ${nome}, esperada ${arquivos[i] ?? '(nenhuma)'}`,
      );
    }
  });

  if (diferencas.length > 0) return { estado: 'divergente', diferencas };
  return { estado: registradas.length === 0 ? 'vazio' : 'gerenciado', diferencas: [] };
}
