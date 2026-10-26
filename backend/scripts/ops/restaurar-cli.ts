import { spawnSync } from 'node:child_process';
import { argumento, confirmarHost } from '../comum/argumentos.ts';
import { restaurar } from './restaurar.ts';

/**
 * `pnpm restaurar --arquivo dump.pgdump [--alvo teste]`, com o destino em `DATABASE_URL` (runbook, seção 4).
 * `URL_ORIGEM` (produção) é obrigatória com destino remoto: recusa destino no mesmo endpoint do Neon. Opcional:
 * `PG_RESTORE` (caminho do `pg_restore` 16).
 */
async function principal(): Promise<number> {
  return restaurar({
    url: process.env['DATABASE_URL'],
    arquivo: argumento('arquivo'),
    alvo: argumento('alvo'),
    ci: process.env['CI'],
    urlOrigem: process.env['URL_ORIGEM'],
    confirmar: confirmarHost,
    comando: process.env['PG_RESTORE'],
    executar: (comando, args, env) => {
      const r = spawnSync(comando, args, { stdio: 'inherit', env }); // ambiente já limpo (SEC-011)
      if (r.error) throw new Error(`Não foi possível rodar ${comando} (instale o cliente do PostgreSQL 16).`);
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
