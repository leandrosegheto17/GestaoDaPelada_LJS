import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrar } from '../../api/src/infraestrutura/db/migrar.ts';
import { comSaida, conectar } from './conectar.ts';
import { exigirHostPermitido } from './host.ts';

type Env = Record<string, string | undefined>;

/** Falha cedo e com a mensagem de docker compose se o Postgres não estiver no ar (FUN-55). */
async function conferirEMigrar(url: string): Promise<string[]> {
  await (await conectar(url)).end();
  return migrar(url);
}

/**
 * Lê DATABASE_URL_MIGRACAO, aplica a trava de host (FUN-19) e chama `migrar`.
 * A trava só é dispensada no deploy, que define PELADA_DEPLOY=1.
 */
export async function executarMigrar(
  env: Env = process.env,
  executar: (url: string) => Promise<string[]> = conferirEMigrar,
): Promise<string[]> {
  const url = env.DATABASE_URL_MIGRACAO;
  if (!url) throw new Error('Defina DATABASE_URL_MIGRACAO (veja .env.example)');
  if (env.PELADA_DEPLOY !== '1') exigirHostPermitido(url);
  return executar(url);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await comSaida(async () => {
    const aplicadas = await executarMigrar();
    console.log(
      aplicadas.length === 0 ? 'Nada a migrar.' : `${aplicadas.length} migração(ões) aplicada(s).`,
    );
  });
}
