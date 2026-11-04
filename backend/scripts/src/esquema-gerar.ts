import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { comBancoDeTeste } from '../../api/test/apoio/banco.ts';
import {
  ARQUIVO_ESQUEMA_PRODUCAO,
  lerEsquema,
  ROLES_DA_APLICACAO,
} from '../../api/src/infraestrutura/db/esquema.ts';
import { migrar } from '../../api/src/infraestrutura/db/migrar.ts';

/** Migra um banco vazio descartável só com as 23 migrações e grava a referência do schema (FUN-08). */
export async function gerarReferencia(): Promise<number> {
  return comBancoDeTeste(async (url) => {
    await migrar(url);
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      const linhas = await lerEsquema(c, { roles: ROLES_DA_APLICACAO });
      writeFileSync(ARQUIVO_ESQUEMA_PRODUCAO, linhas.join('\n') + '\n', 'utf8');
      return linhas.length;
    } finally {
      await c.end();
    }
  });
}

if (import.meta.main) {
  gerarReferencia().then(
    (n) => console.log(`esquema-producao.txt gravado com ${n} linhas`),
    (e) => {
      console.error((e as Error).message);
      process.exit(1);
    },
  );
}
