import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MENSAGEM_BANCO_FORA } from '../src/conectar.ts';
// @ts-expect-error O script é JavaScript puro, sem declaração de tipos.
import { portaDoBanco, urlHyperdrive } from '../../../scripts/dev.mjs';

const RAIZ = join(import.meta.dirname, '..', '..', '..');

/** Uma porta livre agora e sem ninguém ouvindo depois: conexão nela dá ECONNREFUSED. */
async function portaFechada(): Promise<number> {
  const servidor = createServer();
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = (servidor.address() as { port: number }).port;
  await new Promise((ok) => servidor.close(ok));
  return porta;
}

describe('pnpm dev', () => {
  test('FUN-04: a string do Hyperdrive local usa pelada_app e a senha do ambiente, codificada', () => {
    const url = urlHyperdrive({ PELADA_APP_SENHA: 'a b@c' }) as string;
    expect(url).toBe('postgres://pelada_app:a%20b%40c@127.0.0.1:5432/pelada');
    expect(urlHyperdrive({ PELADA_APP_SENHA: 'x', PELADA_DEV_BANCO_PORTA: '5544' })).toContain(
      ':5544/',
    );
    expect(portaDoBanco({})).toBe(5432);
  });

  test('FUN-04: sem PELADA_APP_SENHA, aponta o .env e o seed, sem inventar senha', () => {
    expect(() => urlHyperdrive({})).toThrow(/PELADA_APP_SENHA.*\.env/s);
  });

  test('FUN-04: o arquivo versionado do wrangler não tem senha na localConnectionString', () => {
    const wrangler = readFileSync(join(RAIZ, 'wrangler.jsonc'), 'utf8');
    const local = /"localConnectionString":\s*"([^"]+)"/.exec(wrangler)?.[1] ?? '';
    expect(local).toMatch(/^postgres:\/\/pelada_app@127\.0\.0\.1/);
    expect(new URL(local).password).toBe('');
  });

  test('FUN-04, FUN-55: com o Postgres parado, pnpm dev sai dizendo para rodar docker compose up -d', async () => {
    const porta = await portaFechada();
    const senha = 'senha-que-nao-pode-vazar';
    const r = spawnSync(process.execPath, [join(RAIZ, 'scripts', 'dev.mjs')], {
      env: { ...process.env, PELADA_APP_SENHA: senha, PELADA_DEV_BANCO_PORTA: String(porta) },
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(MENSAGEM_BANCO_FORA);
    expect(r.stderr).toContain('docker compose up -d');
    expect(r.stdout + r.stderr).not.toContain(senha);
  });
});
