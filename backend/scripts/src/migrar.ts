import { migrar } from '../../api/src/infraestrutura/db/migrar.ts';
import { conectar } from './conectar.ts';
import { exigirHostPermitido, HOSTS_LOCAIS } from './host.ts';

/** Variável que o deploy define para migrar um banco remoto (FUN-19). Ausente = só banco local. */
export const PERMISSAO_HOST_REMOTO = 'PELADA_PERMITIR_HOST_REMOTO';

/** `pnpm migrar`: trava de host, aviso de banco fora do ar e migrações pendentes (FUN-07, FUN-19, FUN-55). */
export async function executarMigrar(env: NodeJS.ProcessEnv): Promise<string[]> {
  const url = env.DATABASE_URL_MIGRACAO;
  if (!url) throw new Error('Defina DATABASE_URL_MIGRACAO (veja o .env.example).');
  if (env[PERMISSAO_HOST_REMOTO] !== '1') exigirHostPermitido(url, HOSTS_LOCAIS);

  const sonda = await conectar(url);
  await sonda.end();
  return migrar(url);
}

if (import.meta.main) {
  executarMigrar(process.env).then(
    (aplicadas) => console.log(`Migrações aplicadas agora: ${aplicadas.length}`),
    (erro) => {
      console.error((erro as Error).message);
      process.exit(1);
    },
  );
}
