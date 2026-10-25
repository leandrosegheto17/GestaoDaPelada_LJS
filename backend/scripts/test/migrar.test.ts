import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(import.meta.dirname, '../../..');

function rodarMigrar(url: string, ...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url };
  delete env['CI'];
  return spawnSync(process.execPath, ['backend/scripts/migrar.ts', ...args], { cwd: raiz, env, encoding: 'utf8' });
}

async function portaFechada(): Promise<number> {
  const servidor = createServer();
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = (servidor.address() as { port: number }).port;
  await new Promise((ok) => servidor.close(ok));
  return porta;
}

describe('pnpm migrar', () => {
  it('com o banco local fora do ar, falha dizendo para rodar `docker compose up -d` (FUN-53)', async () => {
    const r = rodarMigrar(`postgres://u:segredo@127.0.0.1:${await portaFechada()}/pelada`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Rode `docker compose up -d`');
    expect(r.stderr).not.toContain('segredo');
  });

  it('recusa host remoto sem --alvo antes de conectar (trava de host)', () => {
    const r = rodarMigrar('postgres://u:segredo@ep-x.sa-east-1.aws.neon.tech/neondb');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('informe --alvo producao ou --alvo teste');
    expect(r.stderr).not.toContain('segredo');
  });
});
