import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { exigirBancoNoAr } from './comum/exigir-banco.ts';
import { ambienteDoDev } from './dev/ambiente.ts';

/**
 * `pnpm dev` (FUN-04): confere o banco local (FUN-53), sobe o `wrangler dev` com o Hyperdrive apontando para o Postgres
 * local e o Vite com proxy de `/api` para o Worker. Ctrl+C encerra os dois.
 */
async function principal(): Promise<void> {
  const variaveis = ambienteDoDev(process.env);
  await exigirBancoNoAr(process.env['DATABASE_URL']);

  const env = { ...process.env, ...variaveis };
  const noWindows = process.platform === 'win32';
  const rodar = (args: string[]): ChildProcess => spawn('pnpm', args, { stdio: 'inherit', env, shell: noWindows });
  const processos = [
    rodar(['--filter', '@pelada/api', 'exec', 'wrangler', 'dev', '--config', '../../wrangler.jsonc', '--port', '8787']),
    rodar(['--filter', '@pelada/web', 'exec', 'vite']),
  ];

  let encerrando = false;
  const encerrar = (codigo: number): void => {
    if (encerrando) return;
    encerrando = true;
    for (const p of processos) {
      if (p.exitCode !== null || p.pid === undefined) continue;
      // No Windows o filho é um shell: só a árvore inteira derruba o wrangler, o workerd e o Vite.
      if (noWindows) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      else p.kill();
    }
    process.exitCode = codigo;
  };
  for (const p of processos) p.once('exit', (codigo) => encerrar(codigo ?? 1));
  process.once('SIGINT', () => encerrar(0));
  process.once('SIGTERM', () => encerrar(0));
}

principal().catch((erro: unknown) => {
  // A trava de host e o aviso de banco fora do ar já trazem a mensagem para a pessoa; nenhuma delas inclui a URL.
  console.error(erro instanceof Error ? erro.message : 'Falha ao subir o ambiente de desenvolvimento.');
  process.exit(1);
});
