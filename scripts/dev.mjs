// `pnpm dev` (FUN-04, FUN-55): confere o Postgres local, sobe o `wrangler dev` (Worker + API em /api/*, Hyperdrive
// apontando para o banco local como `pelada_app`) e o Vite com proxy de /api para o Worker.
// A senha de `pelada_app` vem de PELADA_APP_SENHA (.env, ignorado pelo git); nunca fica em arquivo versionado.
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { MENSAGEM_BANCO_FORA } from '../backend/scripts/src/conectar.ts';

const HOST_BANCO = '127.0.0.1';
const BASE = 'postgres://pelada_app';

export function portaDoBanco(env) {
  return Number(env.PELADA_DEV_BANCO_PORTA ?? 5432);
}

/** String do Hyperdrive local. Falha, sem imprimir segredo, se a senha não estiver no ambiente. */
export function urlHyperdrive(env) {
  const senha = env.PELADA_APP_SENHA;
  if (!senha) {
    throw new Error(
      'PELADA_APP_SENHA ausente. Copie .env.example para .env, defina a senha de pelada_app e rode `pnpm seed`.',
    );
  }
  return `${BASE}:${encodeURIComponent(senha)}@${HOST_BANCO}:${portaDoBanco(env)}/pelada`;
}

/** Resolve se a porta do banco aceita conexão TCP. */
function bancoNoAr(porta) {
  return new Promise((resolver) => {
    const socket = connect({ host: HOST_BANCO, port: porta });
    socket.once('connect', () => {
      socket.destroy();
      resolver(true);
    });
    socket.once('error', () => resolver(false));
  });
}

function iniciar(comando, args, env) {
  return spawn(comando, args, {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

/** Derruba o processo e os filhos (o `pnpm` no Windows roda dentro de um shell). */
function derrubar(filho) {
  if (filho.pid === undefined || filho.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(filho.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    filho.kill('SIGTERM');
  }
}

async function main() {
  const env = { ...process.env };
  let hyperdrive;
  try {
    hyperdrive = urlHyperdrive(env);
  } catch (erro) {
    console.error(erro.message);
    process.exit(1);
  }
  if (!(await bancoNoAr(portaDoBanco(env)))) {
    console.error(MENSAGEM_BANCO_FORA);
    process.exit(1);
  }

  const portaApi = env.PELADA_DEV_PORTA_API ?? '8787';
  const portaWeb = env.PELADA_DEV_PORTA_WEB ?? '5173';
  const worker = iniciar(
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
      HOST_BANCO,
      '--port',
      portaApi,
    ],
    { ...env, CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: hyperdrive },
  );
  const web = iniciar(
    'pnpm',
    [
      '--filter',
      '@pelada/web',
      'exec',
      'vite',
      '--host',
      HOST_BANCO,
      '--port',
      portaWeb,
      '--strictPort',
    ],
    { ...env, PELADA_DEV_PORTA_API: portaApi },
  );

  const filhos = [worker, web];
  const parar = (codigo) => {
    filhos.forEach(derrubar);
    process.exit(codigo);
  };
  for (const filho of filhos) filho.on('exit', (codigo) => parar(codigo ?? 1));
  process.on('SIGINT', () => parar(0));
  process.on('SIGTERM', () => parar(0));
}

if (import.meta.main) await main();
