import { migrar } from '@pelada/api/migrar';
import { comConexao, executarCli } from './conectar.ts';
import { exigirHostPermitido, HOSTS_TESTE } from './host.ts';

export class ErroMigrar extends Error {
  override name = 'ErroMigrar';
}

/**
 * `pnpm migrar` (FUN-07, FUN-19, FUN-55): lê DATABASE_URL_MIGRACAO (role dona do schema),
 * aplica a trava de host fora do deploy e chama `migrar(url)`.
 * Host remoto só com PELADA_PERMITIR_HOST_REMOTO=1, que o deploy.yml define.
 */
export async function comandoMigrar(
  env: Record<string, string | undefined> = process.env,
): Promise<string[]> {
  const url = env.DATABASE_URL_MIGRACAO;
  if (!url) throw new ErroMigrar('DATABASE_URL_MIGRACAO não definida (veja o .env.example).');
  if (env.PELADA_PERMITIR_HOST_REMOTO !== '1') exigirHostPermitido(url, HOSTS_TESTE);
  // Sonda antes do runner, para o banco fora do ar dar a mensagem do docker compose (FUN-55).
  await comConexao(url, async () => undefined);
  return migrar(url, { log: (m) => console.log(m) });
}

if (import.meta.main) {
  await executarCli(async () => {
    const aplicadas = await comandoMigrar();
    console.log(
      aplicadas.length === 0
        ? 'Nenhuma migração pendente.'
        : `Aplicadas ${aplicadas.length}: ${aplicadas.join(', ')}`,
    );
  });
}
