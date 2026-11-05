import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lerJsonc } from './apoio/jsonc.ts';

/**
 * `pnpm dev` (FUN-04, FUN-55): com o Postgres parado, sai com a mensagem do `docker compose up
 * -d`; no ar, o Vite responde `/api/health` pelo proxy para o Worker. O `wrangler.jsonc`
 * versionado não leva senha.
 *
 * O caso "no ar" sobe o wrangler e o Vite de verdade, em portas livres, e precisa do Postgres
 * local de pé (o comando da suíte roda `docker compose up -d --wait` antes).
 */

const RAIZ = join(import.meta.dirname, '..');
const DEV = join(RAIZ, 'scripts', 'dev.mjs');

/** Porta TCP livre em 127.0.0.1, escolhida pelo sistema. */
function portaLivre(): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const s = createServer();
    s.once('error', rejeitar);
    s.listen(0, '127.0.0.1', () => {
      const endereco = s.address();
      s.close(() => (typeof endereco === 'object' && endereco ? resolver(endereco.port) : rejeitar(new Error('sem porta'))));
    });
  });
}

/** Roda o dev.mjs com o ambiente dado e devolve código de saída e saída de erro. */
function rodarDev(env: Record<string, string>, ms = 30_000): Promise<{ codigo: number | null; erro: string }> {
  return new Promise((resolver) => {
    const filho = spawn(process.execPath, [DEV], { cwd: RAIZ, env: { ...process.env, ...env } });
    let erro = '';
    filho.stderr.on('data', (d) => (erro += String(d)));
    const prazo = setTimeout(() => encerrar(filho), ms);
    filho.on('exit', (codigo) => {
      clearTimeout(prazo);
      resolver({ codigo, erro });
    });
  });
}

function encerrar(filho: ChildProcess): void {
  if (filho.exitCode !== null || !filho.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(filho.pid), '/T', '/F'], { stdio: 'ignore' });
  else filho.kill('SIGTERM');
}

async function esperarOk(url: string, ms: number): Promise<Response> {
  const limite = Date.now() + ms;
  let ultimo: unknown;
  while (Date.now() < limite) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      ultimo = new Error(`status ${r.status}`);
    } catch (e) {
      ultimo = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} não respondeu 200 em ${ms} ms: ${String(ultimo)}`);
}

describe('pnpm dev', () => {
  it('FUN-04: com o Postgres parado, sai com código 1 e a mensagem do docker compose up -d (FUN-55)', async () => {
    const fechada = await portaLivre();
    const r = await rodarDev({ PELADA_APP_SENHA: 'senha-de-teste', PELADA_DEV_BANCO_PORTA: String(fechada) });
    expect(r.codigo).toBe(1);
    expect(r.erro).toContain('docker compose up -d');
  });

  it('FUN-04: sem PELADA_APP_SENHA, sai com código 1 e diz o que falta', async () => {
    const r = await rodarDev({ PELADA_APP_SENHA: '' });
    expect(r.codigo).toBe(1);
    expect(r.erro).toContain('PELADA_APP_SENHA');
  });

  it('FUN-04: o localConnectionString do wrangler.jsonc versionado não contém senha', () => {
    const config = lerJsonc<{ hyperdrive: { localConnectionString: string }[] }>(join(RAIZ, 'wrangler.jsonc'));
    for (const h of config.hyperdrive) {
      const url = new URL(h.localConnectionString);
      expect(url.password).toBe('');
      expect(url.username).toBe('pelada_app');
    }
  });

  it('FUN-04: com pnpm dev no ar, GET http://localhost:<web>/api/health responde 200 pelo proxy', async () => {
    const [api, web] = [await portaLivre(), await portaLivre()];
    const filho = spawn(process.execPath, [DEV], {
      cwd: RAIZ,
      env: {
        ...process.env,
        PELADA_APP_SENHA: process.env.PELADA_APP_SENHA || 'senha-de-teste',
        PELADA_DEV_PORTA_API: String(api),
        PELADA_DEV_PORTA_WEB: String(web),
      },
      stdio: 'ignore',
    });
    try {
      const r = await esperarOk(`http://localhost:${web}/api/health`, 90_000);
      expect(await r.json()).toMatchObject({ status: 'ok' });
      expect(r.headers.get('cache-control')).toBe('no-store');
    } finally {
      encerrar(filho);
    }
  }, 120_000);
});
