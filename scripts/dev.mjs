#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MENSAGEM_BANCO_FORA } from '../backend/scripts/src/conectar.ts';

/**
 * `pnpm dev` (FUN-04): sobe o `wrangler dev` (Worker, com o Hyperdrive local como `pelada_app`)
 * e o Vite, com o proxy de `/api` para o Worker. Antes, confere que o Postgres local está de
 * pé; se não, sai com a mensagem do `docker compose up -d` (FUN-55).
 *
 * A senha de `pelada_app` vem do `.env` (`PELADA_APP_SENHA`) e entra só na variável
 * `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` do processo do wrangler: o
 * `localConnectionString` do `wrangler.jsonc` versionado não tem senha.
 *
 * Portas: `PELADA_DEV_BANCO_PORTA` (5432), `PELADA_DEV_PORTA_API` (8787) e
 * `PELADA_DEV_PORTA_WEB` (5173). Tudo escuta só em 127.0.0.1.
 */

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

export const MENSAGEM_SEM_SENHA =
  'Falta PELADA_APP_SENHA no .env (senha da role pelada_app). Copie o .env.example e rode `pnpm seed`.';

/** Portas e a URL do Hyperdrive local, a partir do ambiente. */
export function configuracaoDev(env) {
  const banco = Number(env.PELADA_DEV_BANCO_PORTA || 5432);
  const api = Number(env.PELADA_DEV_PORTA_API || 8787);
  const web = Number(env.PELADA_DEV_PORTA_WEB || 5173);
  const senha = env.PELADA_APP_SENHA ?? '';
  return {
    banco,
    api,
    web,
    senha,
    hyperdrive: `postgres://pelada_app:${encodeURIComponent(senha)}@127.0.0.1:${banco}/pelada`,
  };
}

/** Confere se há algo escutando na porta do Postgres local. */
export function portaAberta(porta, host = '127.0.0.1', espera = 2000) {
  return new Promise((resolver) => {
    const socket = createConnection({ host, port: porta });
    const fim = (aberta) => {
      socket.destroy();
      resolver(aberta);
    };
    socket.setTimeout(espera, () => fim(false));
    socket.once('connect', () => fim(true));
    socket.once('error', () => fim(false));
  });
}

/** Mata o processo e os filhos (no Windows, o `shell` deixa o filho real embaixo do cmd). */
function encerrar(filho) {
  if (!filho || filho.exitCode !== null) return;
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(filho.pid), '/T', '/F'], { stdio: 'ignore' });
  else filho.kill('SIGTERM');
}

export async function principal(env = process.env) {
  const cfg = configuracaoDev(env);
  if (!cfg.senha) {
    console.error(MENSAGEM_SEM_SENHA);
    return 1;
  }
  if (!(await portaAberta(cfg.banco))) {
    console.error(MENSAGEM_BANCO_FORA);
    return 1;
  }

  // O wrangler dev recusa subir se `assets.directory` não existe; sem build do web (CI, clone novo) a pasta nasce vazia.
  mkdirSync(fileURLToPath(new URL('../frontend/web/dist', import.meta.url)), { recursive: true });

  const comum = { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' };
  const worker = spawn(
    'pnpm',
    [
      '--filter',
      '@pelada/api',
      'exec',
      'wrangler',
      'dev',
      '--config',
      '../../wrangler.jsonc',
      '--ip',
      '127.0.0.1',
      '--port',
      String(cfg.api),
    ],
    {
      ...comum,
      env: { ...env, CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: cfg.hyperdrive },
    },
  );
  const web = spawn(
    'pnpm',
    [
      '--filter',
      '@pelada/web',
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      String(cfg.web),
      '--strictPort',
    ],
    { ...comum, env: { ...env, PELADA_DEV_PORTA_API: String(cfg.api) } },
  );

  return new Promise((resolver) => {
    let saindo = false;
    const sair = (codigo) => {
      if (saindo) return;
      saindo = true;
      encerrar(worker);
      encerrar(web);
      resolver(codigo ?? 0);
    };
    worker.on('exit', (c) => sair(c));
    web.on('exit', (c) => sair(c));
    for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => sair(0));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arquivoEnv = `${RAIZ}.env`;
  if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);
  principal().then((codigo) => {
    process.exitCode = codigo;
  });
}
