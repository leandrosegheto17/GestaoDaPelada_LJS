import { spawnSync } from 'node:child_process';
import { UrlDoAlvoAusente, urlDoAlvo } from '../comum/alvo-neon.ts';
import { argumento, confirmarHost } from '../comum/argumentos.ts';
import { restaurar } from './restaurar.ts';

/**
 * `pnpm restaurar --arquivo dump.pgdump [--alvo teste]`, com o destino em `DATABASE_URL` (banco local) ou, com
 * `--alvo teste`, em `NEON_URL_DEV` (branch `dev`), runbook, seção 4 e ADR-032.
 * `NEON_URL_ORIGEM` (produção) é obrigatória com destino remoto: recusa destino no mesmo endpoint do Neon. Opcional:
 * `PG_RESTORE` (caminho do `pg_restore` 18).
 */
async function principal(): Promise<number> {
  const alvo = argumento('alvo');
  const url = urlDoAlvo(alvo, process.env);
  if (alvo === 'teste' && !url) throw new UrlDoAlvoAusente('NEON_URL_DEV');
  return restaurar({
    url,
    arquivo: argumento('arquivo'),
    alvo,
    ci: process.env['CI'],
    urlOrigem: process.env['NEON_URL_ORIGEM'],
    confirmar: confirmarHost,
    comando: process.env['PG_RESTORE'],
    executar: (comando, args, env) => {
      const r = spawnSync(comando, args, { stdio: 'inherit', env }); // ambiente já limpo (SEC-011)
      if (r.error) throw new Error(`Não foi possível rodar ${comando} (instale o cliente do PostgreSQL 18).`);
      return r.status ?? 1;
    },
  });
}

principal().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    // A trava e as recusas já trazem a mensagem para a pessoa; nenhuma delas inclui a URL.
    console.error(erro instanceof Error ? erro.message : 'Falha na restauração.');
    process.exit(1);
  },
);
