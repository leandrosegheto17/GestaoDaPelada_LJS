import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';
import { exigirHostPermitido, HOSTS_LOCAIS } from '../src/host.ts';

const RAIZ = join(import.meta.dirname, '..', '..', '..');

export interface OpcoesRestauracao {
  /** Arquivo `.age` do backup. */
  arquivo: string;
  /** Chave privada age (arquivo local). */
  chave: string;
  /** Banco local vazio onde restaurar. */
  urlDestino: string;
}

/**
 * Decifra o backup com a chave privada e restaura com `pg_restore` (versão 18, do container do
 * compose) num banco local vazio. Devolve a contagem de linhas por tabela (FUN-50).
 */
export async function restaurarBackup(op: OpcoesRestauracao): Promise<Record<string, number>> {
  exigirHostPermitido(op.urlDestino, HOSTS_LOCAIS);
  const destino = new URL(op.urlDestino);
  const banco = destino.pathname.slice(1);
  const usuario = decodeURIComponent(destino.username || 'postgres');

  const cliente = new pg.Client({ connectionString: op.urlDestino });
  await cliente.connect();
  try {
    const { rows } = await cliente.query(
      "select count(*)::int as n from pg_tables where schemaname not in ('pg_catalog','information_schema')",
    );
    if (rows[0].n > 0) {
      throw new Error(`O banco "${banco}" já tem tabelas: restauração recusada`);
    }

    const dump = spawnSync('age', ['-d', '-i', op.chave, op.arquivo], {
      maxBuffer: 1024 * 1024 * 1024,
    });
    if (dump.status !== 0) {
      throw new Error(`Falha ao decifrar o backup: ${dump.stderr.toString().trim()}`);
    }

    const restauro = spawnSync(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'pg_restore', '--no-owner', '-U', usuario, '-d', banco],
      { cwd: RAIZ, input: dump.stdout, maxBuffer: 64 * 1024 * 1024 },
    );
    if (restauro.status !== 0) {
      throw new Error(`pg_restore falhou: ${restauro.stderr.toString().trim()}`);
    }

    const tabelas = await cliente.query(
      "select schemaname, tablename from pg_tables where schemaname not in ('pg_catalog','information_schema') order by 2",
    );
    const contagem: Record<string, number> = {};
    for (const t of tabelas.rows) {
      const r = await cliente.query(
        `select count(*)::int as n from "${t.schemaname}"."${t.tablename}"`,
      );
      contagem[t.tablename] = r.rows[0].n;
    }
    return contagem;
  } finally {
    await cliente.end();
  }
}

if (import.meta.main) {
  const [arquivo, chave, urlDestino] = process.argv.slice(2);
  if (!arquivo || !chave || !urlDestino) {
    console.error('uso: restaurar-backup <arquivo.age> <chave-privada.txt> <url-destino-local>');
    process.exit(2);
  }
  restaurarBackup({ arquivo, chave, urlDestino }).then(
    (c) => console.table(c),
    (e) => {
      console.error((e as Error).message);
      process.exit(1);
    },
  );
}
