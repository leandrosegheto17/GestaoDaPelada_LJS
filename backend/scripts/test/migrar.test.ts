import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(import.meta.dirname, '../../..');

function rodarMigrar(url: string, ...args: string[]) {
  return rodarMigrarCom({ DATABASE_URL: url }, ...args);
}

function rodarMigrarCom(variaveis: NodeJS.ProcessEnv, ...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...variaveis };
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
    const r = rodarMigrar('postgres://u:segredo@ep-x.sa-east-1.aws.neon.tech/pelada');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('informe --alvo producao ou --alvo teste');
    expect(r.stderr).not.toContain('segredo');
  });

  // ADR-032: com --alvo, o destino passa pela validação única do Neon antes da trava de host e de conectar.
  it.each([
    [
      'producao',
      'pooler',
      'postgres://pelada_owner:segredo@ep-x-pooler.sa-east-1.aws.neon.tech/pelada?sslmode=require',
      /pooler/,
    ],
    ['producao', 'sem TLS', 'postgres://pelada_owner:segredo@ep-x.sa-east-1.aws.neon.tech/pelada', /TLS/],
    [
      'producao',
      'role do app',
      'postgres://pelada_app:segredo@ep-x.sa-east-1.aws.neon.tech/pelada?sslmode=require',
      /pelada_owner/,
    ],
    ['producao', 'host local', 'postgres://pelada_owner:segredo@localhost:5432/pelada?sslmode=require', /local/],
    ['teste', 'fora do Neon', 'postgres://pelada_owner:segredo@banco.exemplo.com/pelada?sslmode=require', /neon\.tech/],
  ])('--alvo %s com %s é recusado antes de conectar', (alvo, _nome, url, motivo) => {
    const variavel = alvo === 'producao' ? 'NEON_URL_MIGRACAO' : 'NEON_URL_DEV';
    const r = rodarMigrarCom({ [variavel]: url }, '--alvo', alvo);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(motivo);
    expect(r.stderr).not.toContain('segredo');
  });

  // ADR-032: NEON_URL_MIGRACAO e NEON_URL_DEV para o Neon; DATABASE_URL vale só para o banco local e nunca é lida com --alvo.
  it.each([
    ['producao', 'NEON_URL_MIGRACAO'],
    ['teste', 'NEON_URL_DEV'],
  ])('--alvo %s lê %s e ignora DATABASE_URL', (alvo, variavel) => {
    const neon = 'postgres://pelada_owner:segredo@ep-x.sa-east-1.aws.neon.tech/pelada?sslmode=require';
    const r = rodarMigrarCom({ DATABASE_URL: neon, NEON_URL_MIGRACAO: '', NEON_URL_DEV: '' }, '--alvo', alvo);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`Defina ${variavel}`);
    expect(r.stderr).not.toContain('segredo');
  });
});
