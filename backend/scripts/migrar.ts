import { migrar } from '../api/src/infraestrutura/db/migracoes/migrar.ts';
import { exigirHostPermitido } from '../api/src/infraestrutura/seguranca/trava-host.ts';
import { conferirAlvoNeon, urlDoAlvo } from './comum/alvo-neon.ts';
import { argumento, confirmarHost } from './comum/argumentos.ts';
import { exigirBancoNoAr } from './comum/exigir-banco.ts';

/**
 * `pnpm migrar [--alvo producao|teste]`: detecta o estado do banco e migra (FUN-07 a FUN-10). O destino vem de
 * `DATABASE_URL` (local), `NEON_URL_MIGRACAO` (`--alvo producao`) ou `NEON_URL_DEV` (`--alvo teste`), ADR-032.
 */
async function principal(): Promise<void> {
  const alvo = argumento('alvo');
  const url = urlDoAlvo(alvo, process.env);
  conferirAlvoNeon(url, alvo); // ADR-032: --alvo producao|teste só aceita a conexão direta do owner no Neon.
  await exigirHostPermitido({ url, alvo, ci: process.env['CI'], confirmar: confirmarHost });
  await exigirBancoNoAr(url);

  const { estado, registradas, aplicadas } = await migrar(url as string);
  console.log(`estado: ${estado}`);
  for (const nome of registradas) console.log(`registrada sem executar: ${nome}`);
  for (const nome of aplicadas) console.log(`aplicada: ${nome}`);
  console.log(`${registradas.length} registrada(s) sem executar, ${aplicadas.length} aplicada(s).`);
}

principal().catch((erro: unknown) => {
  // HostRecusado e EstadoParcial já trazem a mensagem para a pessoa; nenhuma delas inclui a URL.
  console.error(erro instanceof Error ? erro.message : 'Erro.');
  process.exit(1);
});
